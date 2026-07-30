import { CohortType } from '@ehr-bridge/sdk';

/** The subset of a patient row a cohort rule needs to decide membership. */
export interface CohortCandidate {
  isAntenatal: boolean;
  isUnderFiveHousehold: boolean;
  hasChronicCondition: boolean;
}

/**
 * A cohort rule is a pure predicate over a patient's registry flags.
 *
 * New cohorts are added by implementing this interface, not by editing the
 * resolver — the same pluggable-adapter shape ehr-bridge uses for mappers.
 */
export interface CohortRule {
  readonly cohortType: CohortType;
  matches(candidate: CohortCandidate): boolean;
}

export class AntenatalCareRule implements CohortRule {
  readonly cohortType: CohortType = 'antenatal-care';
  matches(candidate: CohortCandidate): boolean {
    return candidate.isAntenatal;
  }
}

export class UnderFiveRule implements CohortRule {
  readonly cohortType: CohortType = 'under-five';
  matches(candidate: CohortCandidate): boolean {
    return candidate.isUnderFiveHousehold;
  }
}

export class ChronicConditionRule implements CohortRule {
  readonly cohortType: CohortType = 'chronic-condition';
  matches(candidate: CohortCandidate): boolean {
    return candidate.hasChronicCondition;
  }
}

export const DEFAULT_COHORT_RULES: CohortRule[] = [
  new AntenatalCareRule(),
  new UnderFiveRule(),
  new ChronicConditionRule(),
];
