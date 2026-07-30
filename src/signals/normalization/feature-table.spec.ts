import { buildFeatureTable } from './feature-table';
import { SignalRecord } from '../ingestion/source-adapter.interface';
import { toEpiWeek } from './epi-week';

function rec(
  zoneId: string,
  metric: SignalRecord['metric'],
  value: number,
  isoDate: string,
): SignalRecord {
  return {
    zoneId,
    source: 'test',
    metric,
    value,
    timestamp: new Date(`${isoDate}T00:00:00Z`),
  };
}

describe('buildFeatureTable', () => {
  it('sums same-metric records within a week', () => {
    const rows = buildFeatureTable([
      rec('z1', 'rainfall_mm', 10, '2026-07-27'),
      rec('z1', 'rainfall_mm', 15, '2026-07-28'),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].rainfallMm).toBe(25);
  });

  it('keeps zones separate', () => {
    const rows = buildFeatureTable([
      rec('z1', 'rainfall_mm', 10, '2026-07-27'),
      rec('z2', 'rainfall_mm', 999, '2026-07-27'),
    ]);

    const z1 = rows.find((r) => r.zoneId === 'z1');
    const z2 = rows.find((r) => r.zoneId === 'z2');
    expect(z1?.rainfallMm).toBe(10);
    expect(z2?.rainfallMm).toBe(999);
  });

  it('computes lag1 and lag2 from the preceding weeks', () => {
    const rows = buildFeatureTable([
      rec('z1', 'rainfall_mm', 5, '2026-07-13'), // W29
      rec('z1', 'rainfall_mm', 40, '2026-07-20'), // W30 — the flood spike
      rec('z1', 'rainfall_mm', 8, '2026-07-27'), // W31 — current week
    ]);

    const currentWeek = rows.find(
      (r) => r.epiWeek === toEpiWeek(new Date('2026-07-27T00:00:00Z')),
    );
    expect(currentWeek?.rainfallMm).toBe(8);
    expect(currentWeek?.rainfallMmLag1).toBe(40);
    expect(currentWeek?.rainfallMmLag2).toBe(5);
  });

  it('leaves lag fields undefined when there is no prior week of data', () => {
    const rows = buildFeatureTable([
      rec('z1', 'rainfall_mm', 10, '2026-07-27'),
    ]);

    expect(rows[0].rainfallMmLag1).toBeUndefined();
    expect(rows[0].rainfallMmLag2).toBeUndefined();
  });

  it('computes a 4-week rolling average of case counts from however many weeks exist', () => {
    const rows = buildFeatureTable([
      rec('z1', 'case_count', 2, '2026-07-06'),
      rec('z1', 'case_count', 4, '2026-07-13'),
      rec('z1', 'case_count', 6, '2026-07-20'),
      rec('z1', 'case_count', 8, '2026-07-27'),
    ]);

    const lastWeek = rows[rows.length - 1];
    expect(lastWeek.caseCount).toBe(8);
    expect(lastWeek.caseCountRolling4wkAvg).toBe((2 + 4 + 6 + 8) / 4);
  });

  it('keeps rainfall, standing water and case count independent within a week', () => {
    const rows = buildFeatureTable([
      rec('z1', 'rainfall_mm', 40, '2026-07-27'),
      rec('z1', 'standing_water_days', 3, '2026-07-27'),
      rec('z1', 'case_count', 12, '2026-07-27'),
    ]);

    expect(rows[0]).toMatchObject({
      rainfallMm: 40,
      standingWaterDays: 3,
      caseCount: 12,
    });
  });

  it('returns rows in chronological order', () => {
    const rows = buildFeatureTable([
      rec('z1', 'rainfall_mm', 1, '2026-07-27'),
      rec('z1', 'rainfall_mm', 1, '2026-07-06'),
      rec('z1', 'rainfall_mm', 1, '2026-07-13'),
    ]);

    expect(rows.map((r) => r.epiWeek)).toEqual(
      [...rows.map((r) => r.epiWeek)].sort(),
    );
  });

  it('returns an empty table for no input', () => {
    expect(buildFeatureTable([])).toEqual([]);
  });
});
