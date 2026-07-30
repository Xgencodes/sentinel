import { Logger } from '@nestjs/common';
import {
  SmsAdapter,
  SendSmsRequest,
  SendSmsResult,
} from './sms-adapter.interface';

export interface AfricasTalkingConfig {
  apiKey: string;
  username: string;
  senderId?: string;
  /** Defaults to the live API; override for the sandbox during development. */
  baseUrl?: string;
}

/**
 * Real Africa's Talking SMS integration. Never the default — it requires
 * credentials a stranger's clean clone doesn't have, so TELEMETRY_ADAPTER
 * (the module wiring, see delivery.module.ts) only selects this when
 * AT_API_KEY is actually configured. See SmsDispatchService for the
 * mock-by-default rule.
 */
export class AfricasTalkingAdapter implements SmsAdapter {
  readonly channelId = 'africastalking';
  private readonly logger = new Logger(AfricasTalkingAdapter.name);
  private readonly baseUrl: string;

  constructor(
    private readonly config: AfricasTalkingConfig,
    private readonly httpPost: (
      url: string,
      body: URLSearchParams,
      apiKey: string,
    ) => Promise<{ ok: boolean; json(): Promise<any> }> = postForm,
  ) {
    this.baseUrl = config.baseUrl ?? 'https://api.africastalking.com/version1';
  }

  async sendSms(request: SendSmsRequest): Promise<SendSmsResult> {
    const body = new URLSearchParams({
      username: this.config.username,
      to: request.to,
      message: request.message,
      ...(this.config.senderId ? { from: this.config.senderId } : {}),
    });

    try {
      const response = await this.httpPost(
        `${this.baseUrl}/messaging`,
        body,
        this.config.apiKey,
      );
      if (!response.ok) {
        throw new Error("Africa's Talking responded with a non-OK status");
      }
      const parsed = await response.json();
      const recipient = parsed?.SMSMessageData?.Recipients?.[0];
      if (!recipient || recipient.status !== 'Success') {
        return {
          status: 'failed',
          failureReason: recipient?.status ?? 'unknown provider error',
        };
      }
      return { status: 'sent', providerMessageId: recipient.messageId };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Africa's Talking send failed: ${reason}`);
      return { status: 'failed', failureReason: reason };
    }
  }
}

async function postForm(url: string, body: URLSearchParams, apiKey: string) {
  return fetch(url, {
    method: 'POST',
    headers: {
      apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
}
