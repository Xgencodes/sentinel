export interface InferenceContext {
  /** Free text describing symptoms/situation, in the patient's language. */
  prompt: string;
  language: string;
  /** Structured climate context, when available — see reasoning/climate-context.ts. */
  climateContext?: Record<string, unknown>;
}

export interface InferenceResponse {
  text: string;
  latencyMs: number;
  tokensUsed: number;
  backendId: string;
}

/**
 * Model-agnostic inference. Every implementation of this interface is
 * interchangeable at the call site, which is what lets the reference
 * deployment default to an openly-licensed model with zero training and
 * zero proprietary dependency (Q30/Q21), while a production deployment can
 * point at a hosted, already-trained model without any code change.
 */
export interface InferenceBackend {
  readonly backendId: string;
  generate(context: InferenceContext): Promise<InferenceResponse>;
}
