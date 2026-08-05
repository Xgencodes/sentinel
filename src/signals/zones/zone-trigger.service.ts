import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { newCorrelationId, TelemetryEmitter } from '@ehr-bridge/sdk';
import { DatabaseService } from '../../database/database.service';
import {
  featureRows,
  zoneTriggers,
  facilityRiskScores,
  alerts,
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

    const model = this.models.get();
    const result = model.evaluate({
      zoneId: latestRow.zoneId,
      epiWeek: latestRow.epiWeek,
      rainfallMm: latestRow.rainfallMm ?? 0,
      rainfallMmLag1: latestRow.rainfallMmLag1 ?? undefined,
      rainfallMmLag2: latestRow.rainfallMmLag2 ?? undefined,
      standingWaterDays: latestRow.standingWaterDays ?? 0,
      caseCount: latestRow.caseCount ?? 0,
      caseCountLag1: latestRow.caseCountLag1 ?? undefined,
      caseCountRolling4wkAvg: latestRow.caseCountRolling4wkAvg ?? undefined,
    });

    await database.insert(zoneTriggers).values({
      zoneId,
      epiWeek: latestRow.epiWeek,
      triggered: result.triggered,
      band: result.band,
      sensitivity: result.sensitivity,
      modelVersion: result.modelVersion,
      explanation: result.explanation,
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

    let alertEmitted = false;
    if (result.band === 'high') {
      const message = `Zone ${zoneId} crossed into HIGH risk for ${latestRow.epiWeek}: ${result.explanation}`;
      await database
        .insert(alerts)
        .values({ zoneId, band: result.band, message });
      await this.alertNotifier.notify({ zoneId, band: result.band, message });
      alertEmitted = true;
      this.logger.warn(message);
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
