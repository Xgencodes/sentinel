import {
  InferenceBackend,
  InferenceContext,
  InferenceResponse,
} from './backend.interface';

const DANGER_KEYWORDS = [
  'bleeding',
  'severe pain',
  'no movement',
  'convulsion',
  'seizure',
  'unconscious',
  'difficulty breathing',
  "can't breathe",
  'high fever',
  'blurred vision',
];

const RESPONSES: Record<string, { danger: string; routine: string }> = {
  en: {
    danger:
      'This sounds serious. Please go to the nearest health facility now, or a community health worker will be sent to you.',
    routine:
      "Thank you. Based on what you've told us, please rest, stay hydrated, and contact us again if things get worse.",
  },
  tw: {
    danger:
      'Eyi te sɛ ade a ɛho hia. Yɛsrɛ wo kɔ ayaresabea a ɛbɛn wo mprempren, anaasɛ yɛbɛsoma ɔmanfoɔ akwahosan adwumayɛni akɔ wo hɔ.',
    routine:
      'Meda wo ase. Sɛdeɛ woaka akyerɛ yɛn no, yɛsrɛ wo home, nom nsuo pii, na sɛ ɛyɛ den a, san frɛ yɛn.',
  },
  ee: {
    danger:
      'Ema le vevie ŋutɔ. Meɖe kuku, yi kɔdzi kpuiawo si te ɖe ŋuwò fifia, alo ame si dea alesi le kɔdzi la woɖo ɖa na wò.',
    routine:
      'Akpe na wò. Le nya si nègblɔ ta la, meɖe kuku dzudzɔ, no tsi geɖe, eye ne ele dzi ɖom ɖe edzi la, gaƒo ka na mí.',
  },
};

/**
 * Deterministic, keyword-matched, zero-weight backend. This is the default
 * backend in CI and in the reference deployment's tests — it demonstrates
 * that the flow engine, escalation policy, and eval harness are fully wired
 * end to end before any model exists at all.
 *
 * The keyword matching here is a stand-in for what a real model does; it is
 * not intended to be clinically meaningful. A real backend receives the same
 * InferenceContext and needs no changes to anything that calls it.
 */
export class MockInferenceBackend implements InferenceBackend {
  readonly backendId = 'mock';

  generate(context: InferenceContext): Promise<InferenceResponse> {
    const start = Date.now();
    const promptLower = context.prompt.toLowerCase();
    const isDanger = DANGER_KEYWORDS.some((kw) => promptLower.includes(kw));

    const language = RESPONSES[context.language] ? context.language : 'en';
    const text = isDanger
      ? `[SEVERITY: high] ${RESPONSES[language].danger}`
      : `[SEVERITY: low] ${RESPONSES[language].routine}`;

    return Promise.resolve({
      text,
      latencyMs: Date.now() - start,
      tokensUsed: text.split(/\s+/).length,
      backendId: this.backendId,
    });
  }
}
