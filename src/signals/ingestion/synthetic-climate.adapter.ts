import {
  ClimateMetric,
  SignalRecord,
  SignalWindow,
  SourceAdapter,
} from './source-adapter.interface';

/**
 * Deterministic synthetic data for one climate metric, with the ability to
 * inject a spike for a specific zone/day — this is what lets the demo
 * scenario (sentinel-stack) produce a flood week without any external feed,
 * and lets the same code path run in CI with no network access.
 *
 * Real feeds (CHIRPS rainfall, river gauges, etc.) implement SourceAdapter
 * directly; this class is the default every metric ships with today.
 */
export class SyntheticClimateAdapter implements SourceAdapter {
  private readonly spikes = new Map<string, number>();

  constructor(
    readonly source: string,
    private readonly metric: ClimateMetric,
    private readonly baseline: number,
  ) {}

  fetch(zoneId: string, window: SignalWindow): Promise<SignalRecord[]> {
    const records: SignalRecord[] = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let t = window.from.getTime(); t <= window.to.getTime(); t += dayMs) {
      const timestamp = new Date(t);
      const value =
        this.spikes.get(this.spikeKey(zoneId, timestamp)) ?? this.baseline;
      records.push({
        zoneId,
        source: this.source,
        metric: this.metric,
        value,
        timestamp,
      });
    }

    return Promise.resolve(records);
  }

  /** Used by seed scripts and tests to construct a deliberate flood week. */
  injectSpike(zoneId: string, date: Date, value: number): void {
    this.spikes.set(this.spikeKey(zoneId, date), value);
  }

  private spikeKey(zoneId: string, date: Date): string {
    return `${zoneId}:${date.toISOString().slice(0, 10)}`;
  }
}
