import { Test, TestingModule } from '@nestjs/testing';
import {
  FacilityRouterService,
  ROAD_ACCESS_ADAPTER,
} from './facility-router.service';
import { SyntheticRoadAccessAdapter } from './road-access.adapter';
import { DatabaseService } from '../../database/database.service';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';

const ORIGIN_ZONE = 'flood-zone-1';

function facility(overrides: Partial<any>) {
  return {
    id: overrides.id,
    name: overrides.name,
    bedsAvailable: 0,
    specialties: [],
    ...overrides,
  };
}

describe('FacilityRouterService', () => {
  let roadAccess: SyntheticRoadAccessAdapter;
  let findMany: jest.Mock;
  let insertedPlacements: any[];
  let bedUpdates: string[];
  let emit: jest.Mock;

  async function buildService(facilities: any[]) {
    findMany = jest.fn().mockResolvedValue(facilities);
    roadAccess = new SyntheticRoadAccessAdapter();
    insertedPlacements = [];
    bedUpdates = [];
    emit = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacilityRouterService,
        {
          provide: DatabaseService,
          useValue: {
            getDb: () => ({
              query: { facilities: { findMany } },
              insert: () => ({
                values: (values: any) => {
                  insertedPlacements.push(values);
                  return Promise.resolve([]);
                },
              }),
              update: () => ({
                set: () => ({
                  where: (condition: any) => {
                    bedUpdates.push(condition);
                    return Promise.resolve([]);
                  },
                }),
              }),
            }),
          },
        },
        { provide: ROAD_ACCESS_ADAPTER, useValue: roadAccess },
        { provide: SENTINEL_TELEMETRY, useValue: { emit } },
      ],
    }).compile();

    return module.get(FacilityRouterService);
  }

  it('prefers the facility with beds, matching specialty and a passable road', async () => {
    const service = await buildService([
      facility({
        id: 'f-general',
        name: 'General Clinic',
        bedsAvailable: 5,
        specialties: [],
      }),
      facility({
        id: 'f-obstetric',
        name: 'Obstetric Referral',
        bedsAvailable: 3,
        specialties: [{ code: 'obstetrics' }],
      }),
    ]);

    const result = await service.selectReceiving(ORIGIN_ZONE, 'obstetrics');

    expect(result.facilityId).toBe('f-obstetric');
    expect(result.bedConfirmed).toBe(true);
    expect(result.specialtyMatched).toBe(true);
    expect(result.roadAccessible).toBe(true);
  });

  it('excludes a facility with zero available beds regardless of specialty match', async () => {
    const service = await buildService([
      facility({
        id: 'f-full',
        name: 'Full Obstetric Unit',
        bedsAvailable: 0,
        specialties: [{ code: 'obstetrics' }],
      }),
      facility({
        id: 'f-general',
        name: 'General Clinic',
        bedsAvailable: 2,
        specialties: [],
      }),
    ]);

    const result = await service.selectReceiving(ORIGIN_ZONE, 'obstetrics');

    // Degrades to the facility that actually has capacity, even without
    // the specialty match, rather than routing to a full unit.
    expect(result.facilityId).toBe('f-general');
    expect(result.specialtyMatched).toBe(false);
  });

  it('degrades away from a facility whose road is blocked', async () => {
    const service = await buildService([
      facility({ id: 'f-near', name: 'Near Clinic', bedsAvailable: 3 }),
      facility({ id: 'f-far', name: 'Far Clinic', bedsAvailable: 3 }),
    ]);
    roadAccess.block(ORIGIN_ZONE, 'f-near');

    const result = await service.selectReceiving(ORIGIN_ZONE);

    expect(result.facilityId).toBe('f-far');
    expect(result.roadAccessible).toBe(true);
  });

  it('still returns the best available option when every road is blocked', async () => {
    const service = await buildService([
      facility({ id: 'f-a', name: 'Clinic A', bedsAvailable: 3 }),
      facility({ id: 'f-b', name: 'Clinic B', bedsAvailable: 1 }),
    ]);
    roadAccess.block(ORIGIN_ZONE, 'f-a');
    roadAccess.block(ORIGIN_ZONE, 'f-b');

    const result = await service.selectReceiving(ORIGIN_ZONE);

    expect(result.bedConfirmed).toBe(true);
    expect(result.roadAccessible).toBe(false);
    expect(result.facilityId).toBe('f-a'); // more spare beds is the tiebreaker
  });

  it('reports no placement rather than throwing when nothing has capacity', async () => {
    const service = await buildService([
      facility({ id: 'f-full-1', bedsAvailable: 0 }),
      facility({ id: 'f-full-2', bedsAvailable: 0 }),
    ]);

    const result = await service.selectReceiving(ORIGIN_ZONE);

    expect(result.facilityId).toBeNull();
    expect(result.bedConfirmed).toBe(false);
    expect(result.alternatives).toEqual([]);
  });

  it('treats specialty as satisfied when none is required', async () => {
    const service = await buildService([
      facility({ id: 'f-1', bedsAvailable: 2, specialties: [] }),
    ]);

    const result = await service.selectReceiving(ORIGIN_ZONE);

    expect(result.specialtyMatched).toBe(true);
  });

  it('persists a placement and emits telemetry when a patientId is given', async () => {
    const service = await buildService([
      facility({ id: 'f-1', bedsAvailable: 2, specialties: [] }),
    ]);

    const result = await service.selectReceiving(
      ORIGIN_ZONE,
      undefined,
      'patient-1',
      'corr-1',
    );

    expect(result.facilityId).toBe('f-1');
    expect(insertedPlacements).toEqual([
      expect.objectContaining({
        patientId: 'patient-1',
        facilityId: 'f-1',
        correlationId: 'corr-1',
        bedConfirmed: true,
      }),
    ]);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'placement.confirmed', patientId: 'patient-1' }),
    );
    expect(bedUpdates).toHaveLength(1);
  });

  it('does not persist a placement when no patientId is given', async () => {
    const service = await buildService([
      facility({ id: 'f-1', bedsAvailable: 2, specialties: [] }),
    ]);

    await service.selectReceiving(ORIGIN_ZONE);

    expect(insertedPlacements).toEqual([]);
    expect(bedUpdates).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });
});
