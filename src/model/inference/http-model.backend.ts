import { Logger } from '@nestjs/common';
import {
  InferenceBackend,
  InferenceContext,
  InferenceResponse,
} from './backend.interface';
import { MockInferenceBackend } from './mock.backend';

export interface HttpModelBackendConfig {
  /** e.g. a self-hosted Ollama/vLLM endpoint, or a hosted inference API. */
  apiUrl: string;
  apiKey?: string;
  backendId: string;
}

/**
 * Calls an external model over HTTP. The reference deployment points this
 * at an openly-licensed model (e.g. via Ollama or a hosted open-weights
 * API) so Q30/Q21 hold with zero training and zero proprietary dependency;
 * a production deployment can point the same interface at AIDA's hosted
 * model by changing configuration only.
 *
 * Falls back to the mock backend if the call fails or isn't configured —
 * a misconfigured or unreachable model API must not take down triage.
 */
export class HttpModelBackend implements InferenceBackend {
  readonly backendId: string;
  private readonly logger = new Logger(HttpModelBackend.name);
  private readonly fallback = new MockInferenceBackend();

  constructor(
    private readonly config: HttpModelBackendConfig,
    private readonly httpPost: (
      url: string,
      body: unknown,
      apiKey?: string,
    ) => Promise<{ ok: boolean; json(): Promise<any> }> = fetchJson,
  ) {
    this.backendId = config.backendId;
  }

  async generate(context: InferenceContext): Promise<InferenceResponse> {
    const start = Date.now();
    try {
      const response = await this.httpPost(
        this.config.apiUrl,
        context,
        this.config.apiKey,
      );
      if (!response.ok) {
        throw new Error('model API responded with a non-OK status');
      }
      const body = await response.json();
      return {
        text: body.text,
        latencyMs: Date.now() - start,
        tokensUsed: body.tokensUsed ?? 0,
        backendId: this.backendId,
      };
    } catch (error) {
      this.logger.warn(
        `HTTP model backend unavailable, falling back to mock: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.fallback.generate(context);
    }
  }
}

async function fetchJson(url: string, body: unknown, apiKey?: string) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
