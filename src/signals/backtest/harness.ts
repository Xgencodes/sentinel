import { RiskModel } from '../models/risk-model.interface';
import { FeatureRow } from '../normalization/feature-table';

export interface BacktestRow extends FeatureRow {
  /** Ground truth: did an outbreak actually occur this week? Synthetic-labelled only. */
  actualOutbreak: boolean;
}

export interface BacktestReport {
  modelVersion: string;
  weeksEvaluated: number;
  /** Of actual outbreak weeks, the fraction the model triggered on. Reported first: this is a trigger, not a forecaster. */
  sensitivity: number;
  /** Of triggered weeks, the fraction that were real — secondary by design. */
  precision: number;
  /** Weeks between trigger and the outbreak week, averaged over true positives. */
  meanLeadTimeWeeks: number;
  banner: string;
}

/**
 * Replays a synthetic, labelled history through a RiskModel and reports
 * sensitivity and lead time first, precision second — the ordering matches
 * the trigger's asymmetric cost (a missed outbreak costs a child; a false
 * alarm costs outreach spend). Wired and runnable end-to-end against
 * synthetic seed data. NOT validated against real historical outbreak
 * data — that is explicitly deferred, see ROADMAP.md.
 */
export function runBacktest(
  model: RiskModel,
  rows: BacktestRow[],
): BacktestReport {
  const sorted = [...rows].sort((a, b) => a.epiWeek.localeCompare(b.epiWeek));

  let truePositives = 0;
  let falsePositives = 0;
  let actualOutbreaks = 0;
  const leadTimes: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const { triggered } = model.evaluate(row);

    if (row.actualOutbreak) {
      actualOutbreaks++;
    }

    if (triggered && row.actualOutbreak) {
      truePositives++;
      leadTimes.push(0); // same-week detection in this synthetic set
    } else if (triggered && !row.actualOutbreak) {
      falsePositives++;
    }
  }

  const sensitivity = actualOutbreaks > 0 ? truePositives / actualOutbreaks : 0;
  const totalTriggered = truePositives + falsePositives;
  const precision = totalTriggered > 0 ? truePositives / totalTriggered : 0;
  const meanLeadTimeWeeks =
    leadTimes.length > 0
      ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      : 0;

  return {
    modelVersion: model.modelVersion,
    weeksEvaluated: sorted.length,
    sensitivity,
    precision,
    meanLeadTimeWeeks,
    banner:
      'Wired and runnable against synthetic data. NOT validated against real historical outbreak data — deferred, see ROADMAP.md.',
  };
}
