import { mentionsPregnancyDangerSign, parseSeverity } from './danger-signs';

describe('mentionsPregnancyDangerSign', () => {
  it.each([
    'I have heavy bleeding',
    'severe headache since this morning',
    'my vision is blurred',
    'the baby is not moving',
    'I had a convulsion',
    'severe abdominal pain',
  ])('detects a danger sign in: %s', (text) => {
    expect(mentionsPregnancyDangerSign(text)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(mentionsPregnancyDangerSign('SEVERE HEADACHE')).toBe(true);
  });

  it('does not flag routine symptom text', () => {
    expect(
      mentionsPregnancyDangerSign('mild tiredness and slight nausea'),
    ).toBe(false);
  });
});

describe('parseSeverity', () => {
  it('extracts the tagged severity level', () => {
    expect(parseSeverity('[SEVERITY: high] please seek care')).toBe('high');
    expect(parseSeverity('[SEVERITY: low] rest and hydrate')).toBe('low');
  });

  it('is case-insensitive on the tag', () => {
    expect(parseSeverity('[severity: HIGH] urgent')).toBe('high');
  });

  it('defaults to low when no tag is present', () => {
    expect(parseSeverity('some untagged response')).toBe('low');
  });
});
