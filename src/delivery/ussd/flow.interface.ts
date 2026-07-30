export interface UssdSessionState {
  step: string;
  data: Record<string, unknown>;
}

export interface UssdStepResult {
  /** Text shown to the caller. */
  text: string;
  /** false ends the session (AT's END); true keeps it open (AT's CON). */
  continueSession: boolean;
  state: UssdSessionState;
}

/**
 * A USSD flow is a small state machine keyed by session id. AT's own
 * session `text` field accumulates every input across the session
 * separated by `*`, which is unreliable for anything but the shallowest
 * menus — so flows are driven by server-side state (see ussd-session.store)
 * and handle() only ever receives the caller's latest single input.
 */
export interface UssdFlow {
  readonly flowId: string;
  start(msisdn: string): Promise<UssdStepResult>;
  handle(
    msisdn: string,
    state: UssdSessionState,
    input: string,
  ): Promise<UssdStepResult>;
}
