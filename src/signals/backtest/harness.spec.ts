import { runBacktest, BacktestRow } from './harness';
import { BaselineTriggerModel } from '../models/baseline-trigger.model';

function row(overrides: Partial<BacktestRow>): BacktestRow {
  return {
    zoneId: 'z1',
    epiWeek: '2026-W01',
    rainfallMm: 0,
    standingWaterDays: 0,
    caseCount: 0,
    actualOutbreak: false,
    ...overrides,
  };
}

describe('runBacktest', () => {
  const model = new BaselineTriggerModel();

  it('reports full sensitivity when every outbreak week is caught', () => {
    const report = runBacktest(model, [
      row({
        epiWeek: '2026-W01',
        rainfallMmLag1: 40,
        standingWaterDays: 2,
        actualOutbreak: true,
      }),
      row({
        epiWeek: '2026-W02',
        rainfallMmLag1: 45,
        standingWaterDays: 3,
        actualOutbreak: true,
      }),
    ]);

    expect(report.sensitivity).toBe(1);
  });

  it('reports reduced sensitivity when a quiet-signal outbreak week is missed', () => {
    const report = runBacktest(model, [
      row({
        epiWeek: '2026-W01',
        rainfallMmLag1: 40,
        standingWaterDays: 2,
        actualOutbreak: true,
      }),
      // No rainfall/standing water/case signal at all, yet an outbreak occurred —
      // the baseline has nothing to go on and will miss this one honestly.
      row({ epiWeek: '2026-W02', actualOutbreak: true }),
    ]);

    expect(report.sensitivity).toBe(0.5);
  });

  it('reports the banner and model version on every run', () => {
    const report = runBacktest(model, [row({})]);

    expect(report.banner).toMatch(/NOT validated/);
    expect(report.modelVersion).toBe(model.modelVersion);
  });

  it('handles an empty history without dividing by zero', () => {
    const report = runBacktest(model, []);

    expect(report.sensitivity).toBe(0);
    expect(report.precision).toBe(0);
    expect(report.weeksEvaluated).toBe(0);
  });

  it('computes precision as a secondary metric alongside sensitivity', () => {
    const report = runBacktest(model, [
      row({
        epiWeek: '2026-W01',
        rainfallMmLag1: 40,
        standingWaterDays: 2,
        actualOutbreak: true,
      }),
      // Triggers (standing water alone is enough) but nothing actually happened.
      row({ epiWeek: '2026-W02', standingWaterDays: 1, actualOutbreak: false }),
    ]);

    expect(report.sensitivity).toBe(1);
    expect(report.precision).toBe(0.5);
  });
});
