import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { newCorrelationId, TelemetryEmitter } from '@ehr-bridge/sdk';
import { DatabaseService } from '../../database/database.service';
import { communityReports } from '../../database/core-schema';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';

export interface SubmitReportRequest {
  zoneId: string;
  reporterMsisdn?: string;
  reportType: string;
  severity?: string;
  freeText?: string;
  intakeChannel: 'ussd' | 'hotline-admin';
}

/**
 * Community-sourced signal: reports filed via USSD or a hotline operator
 * about flooding, standing water, impassable roads, contaminated water, or
 * illness clusters. This is a genuinely low-latency signal — it can precede
 * a satellite/rain-gauge trigger by hours — but it's self-reported, so
 * reports start unverified and a CHW confirms or dismisses them before
 * anything acts on them.
 */
@Injectable()
export class CommunityReportsService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(SENTINEL_TELEMETRY) private readonly telemetry: TelemetryEmitter,
  ) {}

  async submit(request: SubmitReportRequest) {
    const database = this.db.getDb();
    const [report] = await database
      .insert(communityReports)
      .values({
        zoneId: request.zoneId,
        reporterMsisdn: request.reporterMsisdn,
        reportType: request.reportType,
        severity: request.severity,
        freeText: request.freeText,
        intakeChannel: request.intakeChannel,
      })
      .returning();

    await this.telemetry.emit({
      type: 'community.report.submitted',
      correlationId: newCorrelationId(),
      emitterModule: 'sentinel-signals',
      zoneId: request.zoneId,
      reportId: report.id,
      reportType: request.reportType,
      intakeChannel: request.intakeChannel,
      severity: request.severity,
    });

    return report;
  }

  async verify(
    reportId: string,
    verifiedByChwId: string,
    outcome: 'chw-confirmed' | 'dismissed',
  ) {
    const database = this.db.getDb();
    const existing = await database.query.communityReports.findFirst({
      where: eq(communityReports.id, reportId),
    });
    if (!existing) {
      throw new NotFoundException(`Community report ${reportId} not found`);
    }

    const [updated] = await database
      .update(communityReports)
      .set({ verificationStatus: outcome, verifiedByChwId })
      .where(eq(communityReports.id, reportId))
      .returning();

    await this.telemetry.emit({
      type: 'community.report.verified',
      correlationId: newCorrelationId(),
      emitterModule: 'sentinel-signals',
      zoneId: existing.zoneId,
      reportId,
      verifiedBy: verifiedByChwId,
      outcome,
    });

    return updated;
  }

  async findByZone(zoneId: string) {
    const database = this.db.getDb();
    return database.query.communityReports.findMany({
      where: eq(communityReports.zoneId, zoneId),
    });
  }
}
