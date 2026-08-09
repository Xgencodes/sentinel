import { FeatureRow } from '../normalization/feature-table';

export type RiskBand = 'low' | 'medium' | 'high';

/** Structured breakdown of what fed the band decision — for the dashboard's "why" view, not just a prose sentence. */
export interface TriggerFactors {
  rainfallSignalMm: number;
  rainfallTriggered: boolean;
  standingWater: boolean;
  caseSpike: boolean;
  communityReportsConfirmed: number;
  communityReportsTriggered: boolean;
}

export interface TriggerResult {
  triggered: boolean;
  band: RiskBand;
  /** True-positive rate against the synthetic backtest set this model ships with. */
  sensitivity: number;
  modelVersion: string;
  explanation: string;
  factors: TriggerFactors;
}

/**
 * A zone-level trigger model: "is this area now in a risk window?" — not a
 * forecaster. See BaselineTriggerModel for why that distinction is load-
 * bearing rather than cosmetic.
 */
export interface RiskModel {
  readonly modelVersion: string;
  /**
   * communityReportCount: chw-confirmed community reports for this zone in
   * the current window — a ground-truth signal alongside climate features,
   * not a replacement for them.
   */
  evaluate(row: FeatureRow, communityReportCount?: number): TriggerResult;
}
