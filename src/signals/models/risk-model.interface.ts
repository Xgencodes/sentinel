import { FeatureRow } from '../normalization/feature-table';

export type RiskBand = 'low' | 'medium' | 'high';

export interface TriggerResult {
  triggered: boolean;
  band: RiskBand;
  /** True-positive rate against the synthetic backtest set this model ships with. */
  sensitivity: number;
  modelVersion: string;
  explanation: string;
}

/**
 * A zone-level trigger model: "is this area now in a risk window?" — not a
 * forecaster. See BaselineTriggerModel for why that distinction is load-
 * bearing rather than cosmetic.
 */
export interface RiskModel {
  readonly modelVersion: string;
  evaluate(row: FeatureRow): TriggerResult;
}
