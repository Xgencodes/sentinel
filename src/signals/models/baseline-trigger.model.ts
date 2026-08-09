import { RiskModel, TriggerResult, RiskBand } from './risk-model.interface';
import { FeatureRow } from '../normalization/feature-table';

export interface BaselineTriggerConfig {
  /** mm of rainfall (lagged 1-2 weeks) considered heavy enough to matter. */
  highRainfallMm: number;
  mediumRainfallMm: number;
  /** Any standing water at all is a meaningful post-flood signal. */
  standingWaterDaysThreshold: number;
  /** Case count over its own rolling average, as a ratio, that reads as a spike. */
  caseSpikeRatio: number;
}

export const DEFAULT_BASELINE_CONFIG: BaselineTriggerConfig = {
  highRainfallMm: 30,
  mediumRainfallMm: 15,
  standingWaterDaysThreshold: 1,
  caseSpikeRatio: 1.5,
};

/**
 * BASELINE TRIGGER — illustrative thresholds calibrated on synthetic seed
 * data only. Not clinically validated. Not for operational use.
 *
 * This is deliberately a trigger, not a forecaster, per the founder doc: a
 * false positive costs outreach spend, a false negative costs a child. Every
 * threshold below is set to the *permissive* side of that trade-off —
 * rainfall or standing water alone is enough to raise the band, and case
 * count is read as a spike relative to its own recent average rather than
 * an absolute count, so it stays sensitive in both high- and low-baseline
 * zones. Retrospective validation and real calibration are funded, not
 * shipped, work (see ROADMAP.md).
 */
export class BaselineTriggerModel implements RiskModel {
  readonly modelVersion = 'baseline-trigger@0.1.0';

  constructor(
    private readonly config: BaselineTriggerConfig = DEFAULT_BASELINE_CONFIG,
  ) {}

  evaluate(row: FeatureRow, communityReportCount = 0): TriggerResult {
    const rainfallSignal = Math.max(
      row.rainfallMmLag1 ?? 0,
      row.rainfallMmLag2 ?? 0,
    );
    const standingWater =
      row.standingWaterDays >= this.config.standingWaterDaysThreshold;
    const caseSpike =
      row.caseCountRolling4wkAvg !== undefined &&
      row.caseCountRolling4wkAvg > 0 &&
      row.caseCount / row.caseCountRolling4wkAvg >= this.config.caseSpikeRatio;
    // A CHW-confirmed community report is ground truth from someone who
    // actually looked — treated the same as standing water: on its own it's
    // enough to raise medium, and it can push a rainfall/case signal to high.
    const communityReportsTriggered = communityReportCount > 0;

    const band = this.classify(
      rainfallSignal,
      standingWater,
      caseSpike,
      communityReportsTriggered,
    );
    const triggered = band !== 'low';

    return {
      triggered,
      band,
      sensitivity: 0.9, // from the bundled synthetic backtest — see backtest/harness.ts
      modelVersion: this.modelVersion,
      explanation: this.explain(
        rainfallSignal,
        standingWater,
        caseSpike,
        communityReportsTriggered,
        communityReportCount,
        band,
      ),
      factors: {
        rainfallSignalMm: rainfallSignal,
        rainfallTriggered: rainfallSignal >= this.config.mediumRainfallMm,
        standingWater,
        caseSpike,
        communityReportsConfirmed: communityReportCount,
        communityReportsTriggered,
      },
    };
  }

  private classify(
    rainfallSignal: number,
    standingWater: boolean,
    caseSpike: boolean,
    communityConfirmed: boolean,
  ): RiskBand {
    const groundConfirmed = standingWater || communityConfirmed;

    if (rainfallSignal >= this.config.highRainfallMm && groundConfirmed) {
      return 'high';
    }
    if (
      caseSpike &&
      (groundConfirmed || rainfallSignal >= this.config.mediumRainfallMm)
    ) {
      return 'high';
    }
    if (
      rainfallSignal >= this.config.mediumRainfallMm ||
      groundConfirmed ||
      caseSpike
    ) {
      return 'medium';
    }
    return 'low';
  }

  private explain(
    rainfallSignal: number,
    standingWater: boolean,
    caseSpike: boolean,
    communityConfirmed: boolean,
    communityReportCount: number,
    band: RiskBand,
  ): string {
    const reasons: string[] = [];
    if (rainfallSignal >= this.config.mediumRainfallMm) {
      reasons.push(`lagged rainfall ${rainfallSignal.toFixed(1)}mm`);
    }
    if (standingWater) {
      reasons.push('standing water present');
    }
    if (caseSpike) {
      reasons.push('case count spike vs. rolling average');
    }
    if (communityConfirmed) {
      reasons.push(
        `${communityReportCount} CHW-confirmed community report(s)`,
      );
    }
    if (reasons.length === 0) {
      return 'No trigger conditions met.';
    }
    return `${band.toUpperCase()} band: ${reasons.join('; ')}.`;
  }
}
