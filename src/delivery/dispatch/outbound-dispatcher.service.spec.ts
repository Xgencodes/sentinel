import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryTelemetryEmitter } from '@ehr-bridge/sdk';
import { OutboundDispatcherService } from './outbound-dispatcher.service';
import { SMS_ADAPTER } from './delivery.tokens';
import { MockSmsAdapter } from '../channels/mock-sms.adapter';
import { DatabaseService } from '../../database/database.service';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';

function buildDbStub() {
  let campaignCounter = 0;
  let messageCounter = 0;
  const updatedMessages: any[] = [];

  const stub = {
    getDb: () => ({
      insert: (table: any) => ({
        values: (values: any) => ({
          returning: () => {
            if ('cohortSize' in values) {
              return Promise.resolve([
                { id: `campaign-${++campaignCounter}`, ...values },
              ]);
            }
            return Promise.resolve([
              { id: `message-${++messageCounter}`, ...values },
            ]);
          },
        }),
      }),
      update: (_table: any) => ({
        set: (values: any) => ({
          where: () => {
            updatedMessages.push(values);
            return Promise.resolve([]);
          },
        }),
      }),
    }),
  };

  return { stub, updatedMessages };
}

describe('OutboundDispatcherService', () => {
  async function buildService(sms: MockSmsAdapter) {
    const { stub, updatedMessages } = buildDbStub();
    const telemetry = new InMemoryTelemetryEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundDispatcherService,
        { provide: DatabaseService, useValue: stub },
        { provide: SMS_ADAPTER, useValue: sms },
        { provide: SENTINEL_TELEMETRY, useValue: telemetry },
      ],
    }).compile();

    return {
      service: module.get(OutboundDispatcherService),
      telemetry,
      updatedMessages,
    };
  }

  it('sends one message per recipient, in their registered language', async () => {
    const sms = new MockSmsAdapter();
    const { service } = await buildService(sms);

    await service.dispatch('z1', [
      { id: 'p1', msisdn: '+1', language: 'tw', isChw: false },
      { id: 'p2', msisdn: '+2', language: 'ee', isChw: false },
    ]);

    expect(sms.sent).toHaveLength(2);
    // The two languages' templates are genuinely different strings.
    expect(sms.sent[0].message).not.toBe(sms.sent[1].message);
  });

  it('sends CHWs the CHW template, not the patient template', async () => {
    const sms = new MockSmsAdapter();
    const { service } = await buildService(sms);

    await service.dispatch('z1', [
      { id: 'p1', msisdn: '+1', language: 'en', isChw: false },
      { id: 'chw1', msisdn: '+2', language: 'en', isChw: true },
    ]);

    expect(sms.sent[0].message).toMatch(/health worker may contact you/i);
    expect(sms.sent[1].message).toMatch(/visit list/i);
  });

  it('reports sent and failed counts, and continues past a failure', async () => {
    class FlakyAdapter extends MockSmsAdapter {
      sendSms(request: any) {
        if (request.to === '+2') {
          return Promise.resolve({
            status: 'failed' as const,
            failureReason: 'blocked',
          });
        }
        return super.sendSms(request);
      }
    }
    const sms = new FlakyAdapter();
    const { service } = await buildService(sms);

    const result = await service.dispatch('z1', [
      { id: 'p1', msisdn: '+1', language: 'en', isChw: false },
      { id: 'p2', msisdn: '+2', language: 'en', isChw: false },
      { id: 'p3', msisdn: '+3', language: 'en', isChw: false },
    ]);

    expect(result).toEqual({ campaignId: 'campaign-1', sent: 2, failed: 1 });
  });

  it('emits the full contact lifecycle sharing one correlationId per campaign', async () => {
    const sms = new MockSmsAdapter();
    const { service, telemetry } = await buildService(sms);

    await service.dispatch('z1', [
      { id: 'p1', msisdn: '+1', language: 'en', isChw: false },
    ]);

    const types = telemetry.events.map((e) => e.type);
    expect(types).toEqual([
      'campaign.launched',
      'contact.attempted',
      'message.sent',
      'contact.completed',
    ]);
    const correlationIds = new Set(
      telemetry.events.map((e) => e.correlationId),
    );
    expect(correlationIds.size).toBe(1);
  });

  it('handles an empty recipient list without error', async () => {
    const sms = new MockSmsAdapter();
    const { service } = await buildService(sms);

    const result = await service.dispatch('z1', []);

    expect(result).toEqual({ campaignId: 'campaign-1', sent: 0, failed: 0 });
  });
});
