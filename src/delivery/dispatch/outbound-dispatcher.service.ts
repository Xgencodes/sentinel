import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { newCorrelationId, TelemetryEmitter } from '@ehr-bridge/sdk';
import { DatabaseService } from '../../database/database.service';
import { campaigns, messages } from '../../database/core-schema';
import { SmsAdapter } from '../channels/sms-adapter.interface';
import { SMS_ADAPTER } from './delivery.tokens';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';
import { ProvidersService } from '../../registry/providers/providers.service';
import {
  DEFAULT_TEMPLATES,
  renderTemplate,
  TemplateId,
} from './message-templates';

export interface DispatchRecipient {
  id: string;
  msisdn: string;
  language: string;
  /** True for a CHW recipient, false for a patient. */
  isChw: boolean;
}

export interface DispatchResult {
  campaignId: string;
  correlationId: string;
  sent: number;
  failed: number;
}

/**
 * Sends an outbound campaign — the anticipatory half of link 4: AIDA/
 * Sentinel initiating contact rather than waiting for a patient to call.
 * Every recipient gets the template rendered in their own registered
 * language; every send attempt and outcome is recorded and emitted as
 * telemetry so contact-reach and delivery-rate KPIs are queryable.
 */
@Injectable()
export class OutboundDispatcherService {
  private readonly logger = new Logger(OutboundDispatcherService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(SMS_ADAPTER) private readonly sms: SmsAdapter,
    @Inject(SENTINEL_TELEMETRY) private readonly telemetry: TelemetryEmitter,
    private readonly providers: ProvidersService,
  ) {}

  async dispatch(
    zoneId: string,
    recipients: DispatchRecipient[],
    triggerZoneTriggerId?: string,
    correlationId: string = newCorrelationId(),
  ): Promise<DispatchResult> {
    const database = this.db.getDb();

    const [campaign] = await database
      .insert(campaigns)
      .values({ zoneId, triggerZoneTriggerId, cohortSize: recipients.length })
      .returning();

    await this.telemetry.emit({
      type: 'campaign.launched',
      correlationId,
      emitterModule: 'sentinel-delivery',
      zoneId,
      campaignId: campaign.id,
      cohortSize: recipients.length,
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const templateId: TemplateId = recipient.isChw
        ? 'flood-alert-chw'
        : 'flood-alert-patient';
      const text = renderTemplate(
        DEFAULT_TEMPLATES,
        templateId,
        recipient.language,
      );

      const [messageRow] = await database
        .insert(messages)
        .values({
          campaignId: campaign.id,
          patientId: recipient.isChw ? undefined : recipient.id,
          chwId: recipient.isChw ? recipient.id : undefined,
          channel: 'sms',
          language: recipient.language,
          templateId,
        })
        .returning();

      await this.telemetry.emit({
        type: 'contact.attempted',
        correlationId,
        emitterModule: 'sentinel-delivery',
        zoneId,
        campaignId: campaign.id,
        patientId: recipient.id,
        channel: 'sms',
      });

      const result = await this.sms.sendSms({
        to: recipient.msisdn,
        message: text,
      });

      if (result.status === 'sent') {
        sent++;
        await database
          .update(messages)
          .set({ status: 'sent', providerMessageId: result.providerMessageId })
          .where(eq(messages.id, messageRow.id));
        await this.telemetry.emit({
          type: 'message.sent',
          correlationId,
          emitterModule: 'sentinel-delivery',
          zoneId,
          messageId: messageRow.id,
          patientId: recipient.id,
          channel: 'sms',
          language: recipient.language,
        });
        await this.telemetry.emit({
          type: 'contact.completed',
          correlationId,
          emitterModule: 'sentinel-delivery',
          zoneId,
          campaignId: campaign.id,
          patientId: recipient.id,
          channel: 'sms',
        });
      } else {
        failed++;
        await database
          .update(messages)
          .set({ status: 'failed', failureReason: result.failureReason })
          .where(eq(messages.id, messageRow.id));
        await this.telemetry.emit({
          type: 'message.failed',
          correlationId,
          emitterModule: 'sentinel-delivery',
          zoneId,
          messageId: messageRow.id,
          reason: result.failureReason ?? 'unknown',
        });
      }
    }

    this.logger.log(
      `Campaign ${campaign.id}: ${sent} sent, ${failed} failed of ${recipients.length}`,
    );

    return { campaignId: campaign.id, correlationId, sent, failed };
  }

  /**
   * Ad-hoc, single-recipient contact outside the campaign flow — the
   * dashboard's "message this CHW directly" action. Not tied to a
   * campaign/cohort, so it logs a messages row with campaignId left null
   * rather than manufacturing a one-recipient campaign.
   */
  async contactChw(
    chwId: string,
    text: string,
    correlationId: string = newCorrelationId(),
  ) {
    const database = this.db.getDb();
    const chw = await this.providers.findOne(chwId);

    const [messageRow] = await database
      .insert(messages)
      .values({
        chwId,
        channel: 'sms',
        language: chw.languages[0] ?? 'en',
        templateId: 'direct-contact',
      })
      .returning();

    const result = await this.sms.sendSms({ to: chw.phone, message: text });

    if (result.status === 'sent') {
      await database
        .update(messages)
        .set({ status: 'sent', providerMessageId: result.providerMessageId })
        .where(eq(messages.id, messageRow.id));
      await this.telemetry.emit({
        type: 'message.sent',
        correlationId,
        emitterModule: 'sentinel-delivery',
        messageId: messageRow.id,
        patientId: chwId,
        channel: 'sms',
        language: chw.languages[0] ?? 'en',
      });
    } else {
      await database
        .update(messages)
        .set({ status: 'failed', failureReason: result.failureReason })
        .where(eq(messages.id, messageRow.id));
      await this.telemetry.emit({
        type: 'message.failed',
        correlationId,
        emitterModule: 'sentinel-delivery',
        messageId: messageRow.id,
        reason: result.failureReason ?? 'unknown',
      });
    }

    return { sent: result.status === 'sent', messageId: messageRow.id };
  }

  /** Per-recipient message detail for a campaign — dashboard/audit view. */
  async listMessages(campaignId: string) {
    const database = this.db.getDb();
    return database.query.messages.findMany({
      where: eq(messages.campaignId, campaignId),
      with: { patient: true, chw: true },
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    });
  }
}
