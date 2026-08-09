import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryTelemetryEmitter } from '@ehr-bridge/sdk';
import { OutboundDispatcherService } from './outbound-dispatcher.service';
import { SMS_ADAPTER } from './delivery.tokens';
import { MockSmsAdapter } from '../channels/mock-sms.adapter';
import { DatabaseService } from '../../database/database.service';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';
import { ProvidersService } from '../../registry/providers/providers.service';

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
  async function buildService(sms: MockSmsAdapter, chw?: any) {
    const { stub, updatedMessages } = buildDbStub();
    const telemetry = new InMemoryTelemetryEmitter();
    const providers = {
      findOne: jest.fn().mockResolvedValue(
        chw ?? { id: 'chw1', phone: '+2', languages: ['tw'] },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundDispatcherService,
        { provide: DatabaseService, useValue: stub },
        { provide: SMS_ADAPTER, useValue: sms },
        { provide: SENTINEL_TELEMETRY, useValue: telemetry },
        { provide: ProvidersService, useValue: providers },
      ],
    }).compile();

    return {
      service: module.get(OutboundDispatcherService),
      telemetry,
      updatedMessages,
      providers,
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

    expect(result).toMatchObject({
      campaignId: 'campaign-1',
      sent: 2,
      failed: 1,
    });
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

    expect(result).toMatchObject({
      campaignId: 'campaign-1',
      sent: 0,
      failed: 0,
    });
  });

  describe('contactChw', () => {
    it('sends directly to the CHW and records the message as sent', async () => {
      const sms = new MockSmsAdapter();
      const { service, telemetry, providers } = await buildService(sms);

      const result = await service.contactChw('chw1', 'Please check in on patient X');

      expect(providers.findOne).toHaveBeenCalledWith('chw1');
      expect(sms.sent).toHaveLength(1);
      expect(sms.sent[0]).toMatchObject({
        to: '+2',
        message: 'Please check in on patient X',
      });
      expect(result.sent).toBe(true);
      expect(telemetry.events.map((e) => e.type)).toEqual(['message.sent']);
    });

    it('records a failed send without throwing', async () => {
      class FlakyAdapter extends MockSmsAdapter {
        sendSms(request: any) {
          return Promise.resolve({ status: 'failed' as const, failureReason: 'blocked' });
        }
      }
      const { service, telemetry } = await buildService(new FlakyAdapter());

      const result = await service.contactChw('chw1', 'hello');

      expect(result.sent).toBe(false);
      expect(telemetry.events.map((e) => e.type)).toEqual(['message.failed']);
    });
  });
});
