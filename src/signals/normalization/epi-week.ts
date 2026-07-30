/** ISO 8601 week number, formatted as e.g. "2026-W30". */
export function toEpiWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** The epi week immediately before the given one, by ISO week arithmetic. */
export function previousEpiWeek(epiWeek: string, weeksBack = 1): string {
  const [yearStr, weekStr] = epiWeek.split('-W');
  const year = Number(yearStr);
  const week = Number(weekStr);

  // Approximate the week's Thursday and step back by weeksBack*7 days,
  // then recompute — avoids hand-rolling ISO week rollover across years.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const thisWeekThursday = new Date(week1Monday);
  thisWeekThursday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + 3);
  thisWeekThursday.setUTCDate(thisWeekThursday.getUTCDate() - weeksBack * 7);

  return toEpiWeek(thisWeekThursday);
}
