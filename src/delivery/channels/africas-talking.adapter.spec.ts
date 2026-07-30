import { AfricasTalkingAdapter } from './africas-talking.adapter';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

describe('AfricasTalkingAdapter', () => {
  const config = { apiKey: 'test-key', username: 'sentinel' };

  it('sends the username, recipient and message as form-encoded fields', async () => {
    let capturedBody: URLSearchParams | undefined;
    let capturedApiKey: string | undefined;

    const adapter = new AfricasTalkingAdapter(config, (url, body, apiKey) => {
      capturedBody = body;
      capturedApiKey = apiKey;
      return Promise.resolve(
        jsonResponse({
          SMSMessageData: {
            Recipients: [{ status: 'Success', messageId: 'ATXid_123' }],
          },
        }),
      );
    });

    await adapter.sendSms({ to: '+15555550142', message: 'Flood warning' });

    expect(capturedApiKey).toBe('test-key');
    expect(capturedBody?.get('username')).toBe('sentinel');
    expect(capturedBody?.get('to')).toBe('+15555550142');
    expect(capturedBody?.get('message')).toBe('Flood warning');
  });

  it('reports success with the provider message id', async () => {
    const adapter = new AfricasTalkingAdapter(config, () =>
      Promise.resolve(
        jsonResponse({
          SMSMessageData: {
            Recipients: [{ status: 'Success', messageId: 'ATXid_456' }],
          },
        }),
      ),
    );

    const result = await adapter.sendSms({ to: '+1', message: 'hi' });

    expect(result).toEqual({ status: 'sent', providerMessageId: 'ATXid_456' });
  });

  it('reports failure when the provider rejects the recipient', async () => {
    const adapter = new AfricasTalkingAdapter(config, () =>
      Promise.resolve(
        jsonResponse({
          SMSMessageData: {
            Recipients: [{ status: 'InvalidPhoneNumber' }],
          },
        }),
      ),
    );

    const result = await adapter.sendSms({ to: 'bad', message: 'hi' });

    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('InvalidPhoneNumber');
  });

  it('reports failure rather than throwing on a network error', async () => {
    const adapter = new AfricasTalkingAdapter(config, () =>
      Promise.reject(new Error('network unreachable')),
    );

    const result = await adapter.sendSms({ to: '+1', message: 'hi' });

    expect(result.status).toBe('failed');
    expect(result.failureReason).toMatch(/network unreachable/);
  });

  it('reports failure on a non-OK HTTP status', async () => {
    const adapter = new AfricasTalkingAdapter(config, () =>
      Promise.resolve(jsonResponse({}, false)),
    );

    const result = await adapter.sendSms({ to: '+1', message: 'hi' });

    expect(result.status).toBe('failed');
  });

  it('includes the sender id when configured', async () => {
    let capturedBody: URLSearchParams | undefined;
    const adapter = new AfricasTalkingAdapter(
      { ...config, senderId: 'SENTINEL' },
      (url, body) => {
        capturedBody = body;
        return Promise.resolve(
          jsonResponse({
            SMSMessageData: {
              Recipients: [{ status: 'Success', messageId: '1' }],
            },
          }),
        );
      },
    );

    await adapter.sendSms({ to: '+1', message: 'hi' });

    expect(capturedBody?.get('from')).toBe('SENTINEL');
  });
});
