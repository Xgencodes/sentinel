import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';
import { newCorrelationId, TelemetryEmitter } from '@ehr-bridge/sdk';
import { DatabaseService } from '../../database/database.service';
import {
  featureRows,
  zoneTriggers,
  facilityRiskScores,
  alerts,
  communityReports,
} from '../../database/core-schema';
import { facilities } from '../../registry/schema';
import { ModelRegistry } from '../models/model-registry';
import { AlertNotifier } from '../alerts/alert-notifier.interface';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';
import { ALERT_NOTIFIER } from './zone-trigger.tokens';
import { TriggerResult } from '../models/risk-model.interface';

export interface ZoneTriggerOutcome {
  zoneId: string;
  epiWeek: string;
  correlationId: string;
  result: TriggerResult;
  facilityRiskScores: { facilityId: string; band: string }[];
  alertEmitted: boolean;
}

/**
 * Evaluates the latest feature row for a zone and produces the chain's two
 * link-2 outputs: a zone-level trigger ("this area is now in a risk
 * window") and a facility-level risk score per facility in that zone
 * ("this clinic should expect surge"). Distinct objects for distinct
 * consumers — cohort resolution and dispatch read the zone trigger;
 * clinicians and district authorities read facility risk scores.
 */
@Injectable()
export class ZoneTriggerService {
  private readonly logger = new Logger(ZoneTriggerService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly models: ModelRegistry,
    @Inject(ALERT_NOTIFIER) private readonly alertNotifier: AlertNotifier,
    @Inject(SENTINEL_TELEMETRY) private readonly telemetry: TelemetryEmitter,
  ) {}

  async evaluateZone(
    zoneId: string,
    correlationId: string = newCorrelationId(),
  ): Promise<ZoneTriggerOutcome> {
    const database = this.db.getDb();

    const latestRow = await database.query.featureRows.findFirst({
      where: eq(featureRows.zoneId, zoneId),
      orderBy: [desc(featureRows.epiWeek)],
    });

    if (!latestRow) {
      throw new NotFoundException(
        `No feature data for zone ${zoneId} — run ingestion first`,
      );
    }

    // CHW-confirmed community reports are ground truth alongside the
    // climate features — a resident-reported flood a CHW has personally
    // verified counts toward the trigger the same way a sensor would.
    const [{ value: communityReportCount }] = await database
      .select({ value: count() })
      .from(communityReports)
      .where(
        and(
          eq(communityReports.zoneId, zoneId),
          eq(communityReports.verificationStatus, 'chw-confirmed'),
        ),
      );

    const model = this.models.get();
    const result = model.evaluate(
      {
        zoneId: latestRow.zoneId,
        epiWeek: latestRow.epiWeek,
        rainfallMm: latestRow.rainfallMm ?? 0,
        rainfallMmLag1: latestRow.rainfallMmLag1 ?? undefined,
        rainfallMmLag2: latestRow.rainfallMmLag2 ?? undefined,
        standingWaterDays: latestRow.standingWaterDays ?? 0,
        caseCount: latestRow.caseCount ?? 0,
        caseCountLag1: latestRow.caseCountLag1 ?? undefined,
        caseCountRolling4wkAvg: latestRow.caseCountRolling4wkAvg ?? undefined,
      },
      communityReportCount,
    );

    await database.insert(zoneTriggers).values({
      zoneId,
      epiWeek: latestRow.epiWeek,
      triggered: result.triggered,
      band: result.band,
      sensitivity: result.sensitivity,
      modelVersion: result.modelVersion,
      explanation: result.explanation,
      factors: result.factors as unknown as Record<string, unknown>,
    });

    await this.telemetry.emit({
      type: 'zone.triggered',
      correlationId,
      emitterModule: 'sentinel-signals',
      zoneId,
      band: result.band,
      modelVersion: result.modelVersion,
      epiWeek: latestRow.epiWeek,
    });

    // Facility risk score: this MVP derives it directly from the zone's
    // band — every facility in a triggered zone should expect surge. Real
    // per-facility variance (distance from the flood extent, historical
    // catchment volume) is funded work; see ROADMAP.md.
    const zoneFacilities = await database.query.facilities.findMany({
      where: eq(facilities.zoneId, zoneId),
    });

    const scores: { facilityId: string; band: string }[] = [];
    for (const facility of zoneFacilities) {
      await database.insert(facilityRiskScores).values({
        facilityId: facility.id,
        epiWeek: latestRow.epiWeek,
        band: result.band,
        modelVersion: result.modelVersion,
      });
      scores.push({ facilityId: facility.id, band: result.band });
    }

    // Alert on any triggered band (medium or high), not just high — the
    // model already treats medium as "triggered" (see baseline-trigger.model
    // .ts: triggered = band !== 'low'), and cohort contact/dispatch already
    // fires at medium. The alert feed staying silent at medium meant the
    // dashboard showed no record of an event that had already caused an
    // outbound campaign — the feed should reflect what the system acted on.
    //
    // An alert is a standing risk episode per zone, not a log line: an
    // already-open episode is refreshed in place rather than duplicated on
    // every re-evaluation, and dropping back to LOW auto-resolves it.
    const openAlert = await database.query.alerts.findFirst({
      where: and(eq(alerts.zoneId, zoneId), eq(alerts.status, 'open')),
    });

    let alertEmitted = false;
    if (result.triggered) {
      const message = `Zone ${zoneId} crossed into ${result.band.toUpperCase()} risk for ${latestRow.epiWeek}: ${result.explanation}`;
      if (openAlert) {
        await database
          .update(alerts)
          .set({ band: result.band, message })
          .where(eq(alerts.id, openAlert.id));
      } else {
        await database
          .insert(alerts)
          .values({ zoneId, band: result.band, message });
      }
      await this.alertNotifier.notify({ zoneId, band: result.band, message });
      alertEmitted = true;
      this.logger.warn(message);
    } else if (openAlert) {
      await database
        .update(alerts)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedReason: 'Zone returned to LOW band',
        })
        .where(eq(alerts.id, openAlert.id));
    }

    return {
      zoneId,
      epiWeek: latestRow.epiWeek,
      correlationId,
      result,
      facilityRiskScores: scores,
      alertEmitted,
    };
  }
}
