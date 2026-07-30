export interface SendSmsRequest {
  to: string;
  message: string;
}

export interface SendSmsResult {
  status: 'sent' | 'failed';
  providerMessageId?: string;
  failureReason?: string;
}

/**
 * Outbound SMS. USSD, by contrast, is inbound/session-based (a patient or
 * CHW dials a code) rather than something a server pushes — see
 * ussd/flow-engine.ts for that side.
 */
export interface SmsAdapter {
  readonly channelId: string;
  sendSms(request: SendSmsRequest): Promise<SendSmsResult>;
}
