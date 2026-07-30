/**
 * WHO-recognised pregnancy danger signs (bleeding, severe headache/blurred
 * vision suggesting pre-eclampsia, reduced fetal movement, convulsions).
 * Detected independently of the model's own severity call, because the
 * safety floor in EscalationPolicy must not depend on the model getting it
 * right — see escalation-policy.ts.
 */
const PREGNANCY_DANGER_SIGN_PATTERNS = [
  /bleeding/,
  /severe headache/,
  /blurr(ed|y)?\s+vision|vision\s+(is\s+)?blurr(ed|y)?/,
  /(no|not)\s+mov(ing|ed)|no movement/,
  /convulsion/,
  /seizure/,
  /severe abdominal pain/,
  /swelling of (my |the )?(face|hands)/,
];

export function mentionsPregnancyDangerSign(text: string): boolean {
  const lower = text.toLowerCase();
  return PREGNANCY_DANGER_SIGN_PATTERNS.some((pattern) => pattern.test(lower));
}

/** Extracts the "[SEVERITY: x]" tag a backend response carries, defaulting to low. */
export function parseSeverity(responseText: string): 'low' | 'medium' | 'high' {
  const match = /\[SEVERITY:\s*(low|medium|high)\]/i.exec(responseText);
  return (match?.[1].toLowerCase() as 'low' | 'medium' | 'high') ?? 'low';
}
