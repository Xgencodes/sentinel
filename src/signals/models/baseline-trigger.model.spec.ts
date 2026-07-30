import { BaselineTriggerModel } from './baseline-trigger.model';
import { FeatureRow } from '../normalization/feature-table';

function row(overrides: Partial<FeatureRow>): FeatureRow {
  return {
    zoneId: 'z1',
    epiWeek: '2026-W31',
    rainfallMm: 0,
    standingWaterDays: 0,
    caseCount: 0,
    ...overrides,
  };
}

describe('BaselineTriggerModel', () => {
  const model = new BaselineTriggerModel();

  it('does not trigger on a quiet week', () => {
    const result = model.evaluate(
      row({
        rainfallMmLag1: 2,
        rainfallMmLag2: 1,
        standingWaterDays: 0,
        caseCount: 3,
        caseCountRolling4wkAvg: 3,
      }),
    );

    expect(result.triggered).toBe(false);
    expect(result.band).toBe('low');
  });

  it('triggers HIGH on heavy lagged rainfall plus standing water — the flood scenario', () => {
    const result = model.evaluate(
      row({
        rainfallMmLag1: 45,
        rainfallMmLag2: 5,
        standingWaterDays: 2,
        caseCount: 4,
        caseCountRolling4wkAvg: 4,
      }),
    );

    expect(result.band).toBe('high');
    expect(result.triggered).toBe(true);
    expect(result.explanation).toMatch(/standing water/);
  });

  it('is sensitivity-first: standing water alone is enough to raise the band', () => {
    // No meaningful rainfall or case signal at all — only standing water.
    const result = model.evaluate(
      row({
        rainfallMmLag1: 0,
        rainfallMmLag2: 0,
        standingWaterDays: 1,
        caseCount: 0,
      }),
    );

    expect(result.triggered).toBe(true);
    expect(result.band).not.toBe('low');
  });

  it('is sensitivity-first: moderate rainfall alone raises the band without standing water or a case spike', () => {
    const result = model.evaluate(
      row({
        rainfallMmLag1: 20,
        rainfallMmLag2: 0,
        standingWaterDays: 0,
        caseCount: 3,
        caseCountRolling4wkAvg: 3,
      }),
    );

    expect(result.triggered).toBe(true);
    expect(result.band).toBe('medium');
  });

  it('reads case count as a spike relative to its own rolling average, not an absolute count', () => {
    // Absolute count of 3 is tiny, but it is 3x this zone's own baseline —
    // a low-baseline zone must not be systematically under-triggered.
    const spike = model.evaluate(
      row({ rainfallMmLag1: 16, caseCount: 3, caseCountRolling4wkAvg: 1 }),
    );
    // Same absolute count, but in line with a much busier zone's baseline.
    const noSpike = model.evaluate(
      row({
        rainfallMmLag1: 0,
        rainfallMmLag2: 0,
        standingWaterDays: 0,
        caseCount: 3,
        caseCountRolling4wkAvg: 50,
      }),
    );

    expect(spike.band).toBe('high');
    expect(noSpike.band).toBe('low');
  });

  it('escalates to HIGH when a case spike coincides with standing water, even under the high-rainfall threshold', () => {
    const result = model.evaluate(
      row({
        rainfallMmLag1: 5,
        standingWaterDays: 1,
        caseCount: 10,
        caseCountRolling4wkAvg: 4,
      }),
    );

    expect(result.band).toBe('high');
  });

  it('handles a first-observed week with no rolling average without throwing', () => {
    const result = model.evaluate(
      row({
        rainfallMmLag1: undefined,
        rainfallMmLag2: undefined,
        caseCountRolling4wkAvg: undefined,
      }),
    );

    expect(result.triggered).toBe(false);
  });

  it('reports the model version and a non-empty explanation on every result', () => {
    const result = model.evaluate(row({}));

    expect(result.modelVersion).toBe('baseline-trigger@0.1.0');
    expect(result.explanation.length).toBeGreaterThan(0);
  });
});
