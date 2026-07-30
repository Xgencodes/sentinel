import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { UssdFlow, UssdSessionState, UssdStepResult } from './flow.interface';
import { DatabaseService } from '../../database/database.service';
import { providers, patients } from '../../registry/schema';

/**
 * A CHW dials in and gets a prioritised list of who to visit — requirement
 * 4's "prioritised list of who to visit" for the CHW user group. Identity
 * is the calling number, matched against a registered provider; no PIN or
 * account step, since a CHW's phone already is their credential in the
 * field.
 */
@Injectable()
export class ChwVisitListFlow implements UssdFlow {
  readonly flowId = 'chw-visit-list';

  constructor(private readonly db: DatabaseService) {}

  async start(msisdn: string): Promise<UssdStepResult> {
    const database = this.db.getDb();
    const chw = await database.query.providers.findFirst({
      where: eq(providers.phone, msisdn),
    });

    if (!chw || chw.role !== 'chw') {
      return {
        text: 'END This number is not registered as a community health worker.',
        continueSession: false,
        state: { step: 'not-a-chw', data: {} },
      };
    }

    const assigned = await database.query.patients.findMany({
      where: eq(patients.assignedChwId, chw.id),
    });

    if (assigned.length === 0) {
      return {
        text: 'END You have no patients assigned right now.',
        continueSession: false,
        state: { step: 'complete', data: {} },
      };
    }

    const lines = assigned
      .slice(0, 5) // a USSD screen fits a handful of lines at a time
      .map((p, i) => {
        const cohort = p.isAntenatal
          ? 'ANC'
          : p.isUnderFiveHousehold
            ? 'U5'
            : p.hasChronicCondition
              ? 'Chronic'
              : 'General';
        return `${i + 1}. ${p.msisdn} (${cohort})`;
      });

    return {
      text: `END Your visit list:\n${lines.join('\n')}`,
      continueSession: false,
      state: {
        step: 'complete',
        data: { chwId: chw.id, count: assigned.length },
      },
    };
  }

  handle(
    _msisdn: string,
    state: UssdSessionState,
    _input: string,
  ): Promise<UssdStepResult> {
    // Single-screen flow: nothing to handle after start() ends the session.
    return Promise.resolve({
      text: 'END Session already complete.',
      continueSession: false,
      state,
    });
  }
}
