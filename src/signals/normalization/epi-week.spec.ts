import { toEpiWeek, previousEpiWeek } from './epi-week';

describe('toEpiWeek', () => {
  it.each([
    ['2026-07-27', '2026-W31'], // a Monday
    ['2026-01-01', '2026-W01'],
    ['2025-12-31', '2026-W01'], // ISO weeks can belong to the following year
  ])('maps %s to %s', (date, expected) => {
    expect(toEpiWeek(new Date(`${date}T00:00:00Z`))).toBe(expected);
  });

  it('gives every day in the same ISO week the same label', () => {
    const days = [
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-08-02',
    ];
    const weeks = new Set(
      days.map((d) => toEpiWeek(new Date(`${d}T00:00:00Z`))),
    );
    expect(weeks.size).toBe(1);
  });
});

describe('previousEpiWeek', () => {
  it('steps back one week within a year', () => {
    expect(previousEpiWeek('2026-W31', 1)).toBe('2026-W30');
  });

  it('steps back across a year boundary', () => {
    expect(previousEpiWeek('2026-W01', 1)).toBe('2025-W52');
  });

  it('steps back multiple weeks', () => {
    expect(previousEpiWeek('2026-W31', 4)).toBe('2026-W27');
  });

  it('is the identity at zero weeks back', () => {
    expect(previousEpiWeek('2026-W31', 0)).toBe('2026-W31');
  });
});
