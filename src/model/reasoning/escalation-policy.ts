import { ClimateContext, escalationSensitivityBoost } from './climate-context';

export type SeverityLevel = 'low' | 'medium' | 'high';
export type EscalationAction = 'guidance' | 'followUp' | 'escalate';

export interface EscalationInput {
  severity: SeverityLevel;
  /** Whether the patient is in the antenatal-care cohort. */
  isAntenatal: boolean;
  /** Whether the raw text mentioned a pregnancy danger sign, independent of the model's own severity call. */
  pregnancyDangerSignMentioned: boolean;
  climateContext: ClimateContext;
}

export interface EscalationDecision {
  action: EscalationAction;
  /** Set when a safety rule overrode whatever the model itself would have decided. */
  forcedBySafetyRule?: string;
}

const SEVERITY_SCORE: Record<SeverityLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Turns a model's severity read into an action, applying two things the
 * model output alone doesn't carry: a hard safety floor, and the climate
 * sensitivity boost from buildClimateContext.
 *
 * The safety floor is absolute and checked first: any pregnancy danger sign
 * escalates, regardless of what severity the model assigned. This is what
 * "zero unescalated safety-critical pregnancy cases" (the KPI target) means
 * in code rather than as a hoped-for property of the model — see
 * eval/pregnancy-safety.spec for the canary set that must pass 100%.
 */
export class EscalationPolicy {
  decide(input: EscalationInput): EscalationDecision {
    if (input.isAntenatal && input.pregnancyDangerSignMentioned) {
      return {
        action: 'escalate',
        forcedBySafetyRule: 'pregnancy-danger-sign-floor',
      };
    }

    const boost = escalationSensitivityBoost(input.climateContext);
    const effectiveScore = SEVERITY_SCORE[input.severity] + boost;

    if (effectiveScore >= 2) {
      return { action: 'escalate' };
    }
    if (effectiveScore >= 1) {
      return { action: 'followUp' };
    }
    return { action: 'guidance' };
  }
}
