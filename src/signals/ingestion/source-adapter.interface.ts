export interface SignalWindow {
  from: Date;
  to: Date;
}

export type ClimateMetric =
  | 'rainfall_mm'
  | 'river_discharge'
  | 'standing_water_days'
  | 'case_count'
  | 'community_report';

export interface SignalRecord {
  zoneId: string;
  source: string;
  metric: ClimateMetric;
  value: number;
  timestamp: Date;
}

/**
 * A pluggable ingestion source. New feeds are added by implementing this
 * interface and registering an instance — no changes to the normalisation
 * or model layers, mirroring the adapter pattern in ehr-bridge's
 * FHIRMapper (see ehr-bridge/docs/ADAPTERS.md).
 */
export interface SourceAdapter {
  readonly source: string;
  fetch(zoneId: string, window: SignalWindow): Promise<SignalRecord[]>;
}
