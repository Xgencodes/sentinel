import { Injectable } from '@nestjs/common';
import { UssdFlow, UssdSessionState, UssdStepResult } from './flow.interface';
import { PatientSelfRegistrationFlow } from './patient-self-registration.flow';
import { ChwVisitListFlow } from './chw-visit-list.flow';

/**
 * The entry point for every USSD session: presents a short menu and
 * delegates the rest of the session to whichever flow the caller picked.
 * New flows are added by registering them here, not by branching inside
 * an existing flow.
 */
@Injectable()
export class UssdFlowRouter implements UssdFlow {
  readonly flowId = 'root';
  private readonly flows: Map<string, UssdFlow>;

  constructor(
    registrationFlow: PatientSelfRegistrationFlow,
    chwFlow: ChwVisitListFlow,
  ) {
    this.flows = new Map<string, UssdFlow>([
      ['1', registrationFlow],
      ['2', chwFlow],
    ]);
  }

  start(_msisdn: string): Promise<UssdStepResult> {
    return Promise.resolve({
      text: 'CON Welcome to Sentinel.\n1) Register as a patient\n2) CHW visit list',
      continueSession: true,
      state: { step: 'root', data: {} },
    });
  }

  async handle(
    msisdn: string,
    state: UssdSessionState,
    input: string,
  ): Promise<UssdStepResult> {
    if (state.step === 'root') {
      const flow = this.flows.get(input.trim());
      if (!flow) {
        return {
          text: 'CON Please choose 1 or 2:\n1) Register as a patient\n2) CHW visit list',
          continueSession: true,
          state,
        };
      }
      const inner = await flow.start(msisdn);
      return this.wrap(flow.flowId, inner);
    }

    if (state.step === 'in-flow') {
      const flowId = state.data.flowId as string;
      const flow = [...this.flows.values()].find((f) => f.flowId === flowId);
      if (!flow) {
        return this.lost();
      }
      const innerState = state.data.inner as UssdSessionState;
      const result = await flow.handle(msisdn, innerState, input);
      return this.wrap(flowId, result);
    }

    return this.lost();
  }

  private wrap(flowId: string, result: UssdStepResult): UssdStepResult {
    if (!result.continueSession) {
      return result;
    }
    return {
      text: result.text,
      continueSession: true,
      state: { step: 'in-flow', data: { flowId, inner: result.state } },
    };
  }

  private lost(): UssdStepResult {
    return {
      text: 'END Something went wrong. Please dial in again.',
      continueSession: false,
      state: { step: 'root', data: {} },
    };
  }
}
