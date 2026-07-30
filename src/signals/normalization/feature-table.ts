import { SignalRecord } from '../ingestion/source-adapter.interface';
import { previousEpiWeek, toEpiWeek } from './epi-week';

export interface FeatureRow {
  zoneId: string;
  epiWeek: string;
  rainfallMm: number;
  rainfallMmLag1?: number;
  rainfallMmLag2?: number;
  standingWaterDays: number;
  caseCount: number;
  caseCountLag1?: number;
  caseCountRolling4wkAvg?: number;
}

interface WeeklyTotals {
  rainfallMm: number;
  standingWaterDays: number;
  caseCount: number;
}

/**
 * Turns raw ingested signals into a facility x zone x epi-week feature
 * table, keyed here by zone (facility association happens when a facility
 * risk score is derived from its zone's trigger). Pure function so it's
 * testable against synthetic inputs with no database.
 */
export function buildFeatureTable(records: SignalRecord[]): FeatureRow[] {
  const byZoneWeek = new Map<string, Map<string, WeeklyTotals>>();

  for (const record of records) {
    const epiWeek = toEpiWeek(record.timestamp);
    const zoneWeeks = byZoneWeek.get(record.zoneId) ?? new Map();
    const totals = zoneWeeks.get(epiWeek) ?? {
      rainfallMm: 0,
      standingWaterDays: 0,
      caseCount: 0,
    };

    if (record.metric === 'rainfall_mm') {
      totals.rainfallMm += record.value;
    } else if (record.metric === 'standing_water_days') {
      totals.standingWaterDays += record.value;
    } else if (record.metric === 'case_count') {
      totals.caseCount += record.value;
    }

    zoneWeeks.set(epiWeek, totals);
    byZoneWeek.set(record.zoneId, zoneWeeks);
  }

  const rows: FeatureRow[] = [];

  for (const [zoneId, zoneWeeks] of byZoneWeek) {
    for (const [epiWeek, totals] of zoneWeeks) {
      const lag1Week = previousEpiWeek(epiWeek, 1);
      const lag2Week = previousEpiWeek(epiWeek, 2);
      const lag1 = zoneWeeks.get(lag1Week);
      const lag2 = zoneWeeks.get(lag2Week);

      const rolling = [0, 1, 2, 3]
        .map((n) => zoneWeeks.get(previousEpiWeek(epiWeek, n))?.caseCount)
        .filter((v): v is number => v !== undefined);
      const rollingAvg =
        rolling.length > 0
          ? rolling.reduce((a, b) => a + b, 0) / rolling.length
          : undefined;

      rows.push({
        zoneId,
        epiWeek,
        rainfallMm: totals.rainfallMm,
        rainfallMmLag1: lag1?.rainfallMm,
        rainfallMmLag2: lag2?.rainfallMm,
        standingWaterDays: totals.standingWaterDays,
        caseCount: totals.caseCount,
        caseCountLag1: lag1?.caseCount,
        caseCountRolling4wkAvg: rollingAvg,
      });
    }
  }

  return rows.sort((a, b) => a.epiWeek.localeCompare(b.epiWeek));
}
