import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CohortType } from '@ehr-bridge/sdk';
import { DatabaseService } from '../../database/database.service';
import { patients } from '../schema';
import { CohortRule, DEFAULT_COHORT_RULES } from './cohort-rule.interface';

export const COHORT_RULES = Symbol('COHORT_RULES');

export interface ResolvedCohortMember {
  patientId: string;
  msisdn: string;
  language: string;
  assignedChwId: string | null;
  cohorts: CohortType[];
}

export interface ResolvedCohorts {
  zoneId: string;
  cohorts: ResolvedCohortMember[];
}

/**
 * Turns "a flood warning exists" into "these 340 pregnant women in this
 * catchment need contact this week" — the link the founder doc identifies
 * as broken today. Everything downstream (outbound dispatch, CHW visit
 * lists) is driven by this list.
 */
@Injectable()
export class CohortResolverService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(COHORT_RULES)
    private readonly rules: CohortRule[] = DEFAULT_COHORT_RULES,
  ) {}

  async resolve(
    zoneId: string,
    cohortTypes: CohortType[],
  ): Promise<ResolvedCohorts> {
    const database = this.db.getDb();
    const requestedTypes = new Set(cohortTypes);
    const applicableRules = this.rules.filter((rule) =>
      requestedTypes.has(rule.cohortType),
    );

    const zonePatients = await database.query.patients.findMany({
      where: eq(patients.zoneId, zoneId),
    });

    const members: ResolvedCohortMember[] = [];

    for (const patient of zonePatients) {
      const matchedCohorts = applicableRules
        .filter((rule) => rule.matches(patient))
        .map((rule) => rule.cohortType);

      if (matchedCohorts.length > 0) {
        members.push({
          patientId: patient.id,
          msisdn: patient.msisdn,
          language: patient.language,
          assignedChwId: patient.assignedChwId,
          cohorts: matchedCohorts,
        });
      }
    }

    return { zoneId, cohorts: members };
  }
}
