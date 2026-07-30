import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InMemoryTelemetryEmitter } from '@ehr-bridge/sdk';
import { ZoneTriggerService } from './zone-trigger.service';
import { ALERT_NOTIFIER } from './zone-trigger.tokens';
import { ModelRegistry } from '../models/model-registry';
import { DatabaseService } from '../../database/database.service';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';
import { AlertNotifier } from '../alerts/alert-notifier.interface';

const LATEST_ROW = {
  zoneId: 'z1',
  epiWeek: '2026-W31',
  rainfallMm: 40,
  rainfallMmLag1: 45,
  rainfallMmLag2: 5,
  standingWaterDays: 2,
  caseCount: 10,
  caseCountLag1: 4,
  caseCountRolling4wkAvg: 4,
};

const ZONE_FACILITIES = [{ id: 'f1' }, { id: 'f2' }];

describe('ZoneTriggerService', () => {
  let service: ZoneTriggerService;
  let telemetry: InMemoryTelemetryEmitter;
  let notifier: jest.Mocked<AlertNotifier>;
  let inserts: Record<string, any[]>;
  let findFirstImpl: jest.Mock;

  beforeEach(async () => {
    inserts = { zoneTriggers: [], facilityRiskScores: [], alerts: [] };
    telemetry = new InMemoryTelemetryEmitter();
    notifier = { notify: jest.fn().mockResolvedValue(undefined) };
    findFirstImpl = jest.fn().mockResolvedValue(LATEST_ROW);

    const dbStub = {
      getDb: () => ({
        query: {
          featureRows: { findFirst: findFirstImpl },
          facilities: {
            findMany: jest.fn().mockResolvedValue(ZONE_FACILITIES),
          },
        },
        insert: (table: any) => ({
          values: (values: any) => {
            const key = tableKey(table);
            inserts[key] = inserts[key] ?? [];
            inserts[key].push(values);
            return Promise.resolve([]);
          },
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZoneTriggerService,
        ModelRegistry,
        { provide: DatabaseService, useValue: dbStub },
        { provide: ALERT_NOTIFIER, useValue: notifier },
        { provide: SENTINEL_TELEMETRY, useValue: telemetry },
      ],
    }).compile();

    service = module.get(ZoneTriggerService);
  });

  function tableKey(_table: unknown) {
    // The stub doesn't need to distinguish tables by identity for these
    // assertions; callers check counts by insert order instead.
    return 'generic';
  }

  it('throws when there is no feature data for the zone', async () => {
    findFirstImpl.mockResolvedValue(undefined);

    await expect(service.evaluateZone('z1')).rejects.toThrow(NotFoundException);
  });

  it('produces a HIGH band, an alert, and a facility risk score per facility', async () => {
    const outcome = await service.evaluateZone('z1');

    expect(outcome.result.band).toBe('high');
    expect(outcome.alertEmitted).toBe(true);
    expect(outcome.facilityRiskScores).toHaveLength(2);
    expect(outcome.facilityRiskScores.every((s) => s.band === 'high')).toBe(
      true,
    );
  });

  it('notifies the alert channel only when the band is HIGH', async () => {
    findFirstImpl.mockResolvedValue({
      ...LATEST_ROW,
      rainfallMmLag1: 0,
      rainfallMmLag2: 0,
      standingWaterDays: 0,
      caseCount: 3,
      caseCountRolling4wkAvg: 3,
    });

    const outcome = await service.evaluateZone('z1');

    expect(outcome.alertEmitted).toBe(false);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('emits a zone.triggered telemetry event with a correlationId', async () => {
    await service.evaluateZone('z1');

    const events = telemetry.events.filter((e) => e.type === 'zone.triggered');
    expect(events).toHaveLength(1);
    expect(events[0].correlationId).toBeTruthy();
    expect(events[0]).toMatchObject({ zoneId: 'z1', band: 'high' });
  });
});
