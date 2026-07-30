import {
  SmsAdapter,
  SendSmsRequest,
  SendSmsResult,
} from './sms-adapter.interface';

/**
 * Default adapter. No credentials, no network — a stranger cloning the repo
 * gets a fully working dispatch pipeline with zero configuration (Q30).
 * Every message sent through this adapter is recorded so tests and the demo
 * scenario can assert on what would have gone out.
 */
export class MockSmsAdapter implements SmsAdapter {
  readonly channelId = 'mock';
  readonly sent: SendSmsRequest[] = [];

  sendSms(request: SendSmsRequest): Promise<SendSmsResult> {
    this.sent.push(request);
    return Promise.resolve({
      status: 'sent',
      providerMessageId: `mock-${this.sent.length}`,
    });
  }
}
