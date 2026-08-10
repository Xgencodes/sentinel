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
                  return {
                    returning: () =>
                      Promise.resolve([{ id: `placement-${insertedPlacements.length}`, ...values }]),
                  };
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
    expect(result.placementId).toBe('placement-1');
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

describe('FacilityRouterService.overrideDestination / updateOutcome', () => {
  function whereResult(rows: any[]) {
    const promise = Promise.resolve(rows) as any;
    promise.returning = () => Promise.resolve(rows);
    return promise;
  }

  async function buildService(opts: {
    placement?: any;
    facility?: any;
  }) {
    const findFirstPlacement = jest.fn().mockResolvedValue(opts.placement);
    const findFirstFacility = jest.fn().mockResolvedValue(opts.facility);
    const updateCalls: { set: any }[] = [];
    const emit = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacilityRouterService,
        {
          provide: DatabaseService,
          useValue: {
            getDb: () => ({
              query: {
                placements: { findFirst: findFirstPlacement },
                facilities: { findFirst: findFirstFacility },
              },
              update: () => ({
                set: (set: any) => {
                  updateCalls.push({ set });
                  if (!opts.placement) {
                    return { where: () => whereResult([]) };
                  }
                  const nextPlacement = { ...opts.placement, ...set };
                  return { where: () => whereResult([nextPlacement]) };
                },
              }),
            }),
          },
        },
        { provide: ROAD_ACCESS_ADAPTER, useValue: new SyntheticRoadAccessAdapter() },
        { provide: SENTINEL_TELEMETRY, useValue: { emit } },
      ],
    }).compile();

    return { service: module.get(FacilityRouterService), updateCalls, emit };
  }

  it('moves a placement to a new facility and rebalances beds on both sides', async () => {
    const placement = { id: 'placement-1', facilityId: 'f-old', patientId: 'patient-1' };
    const newFacility = { id: 'f-new', bedsAvailable: 2 };
    const { service, updateCalls } = await buildService({
      placement,
      facility: newFacility,
    });

    const result = await service.overrideDestination('placement-1', 'f-new');

    expect(result.facilityId).toBe('f-new');
    expect(result.overridden).toBe(true);
    // Two bed-rebalance updates (old facility +1, new facility -1) plus the placement update.
    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[2].set).toEqual(
      expect.objectContaining({ facilityId: 'f-new', overridden: true }),
    );
  });

  it('is a no-op when the new facility is already the current destination', async () => {
    const placement = { id: 'placement-1', facilityId: 'f-same', patientId: 'patient-1' };
    const { service, updateCalls } = await buildService({
      placement,
      facility: { id: 'f-same', bedsAvailable: 3 },
    });

    const result = await service.overrideDestination('placement-1', 'f-same');

    expect(result).toEqual(placement);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects when the new facility has no available beds', async () => {
    const placement = { id: 'placement-1', facilityId: 'f-old', patientId: 'patient-1' };
    const { service, updateCalls } = await buildService({
      placement,
      facility: { id: 'f-full', bedsAvailable: 0 },
    });

    await expect(
      service.overrideDestination('placement-1', 'f-full'),
    ).rejects.toThrow('has no available beds');
    expect(updateCalls).toHaveLength(0);
  });

  it('throws NotFoundException when the placement does not exist', async () => {
    const { service } = await buildService({ placement: undefined });

    await expect(
      service.overrideDestination('missing', 'f-new'),
    ).rejects.toThrow('Placement missing not found');
  });

  it('updates the outcome status and emits telemetry', async () => {
    const placement = {
      id: 'placement-1',
      patientId: 'patient-1',
      facilityId: 'f-1',
      outcomeStatus: 'ongoing',
    };
    const { service, emit } = await buildService({ placement });

    const result = await service.updateOutcome('placement-1', 'recovered');

    expect(result.outcomeStatus).toBe('recovered');
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'outcome.recorded',
        patientId: 'patient-1',
        facilityId: 'f-1',
        status: 'recovered',
      }),
    );
  });

  it('throws NotFoundException when updating the outcome of a missing placement', async () => {
    const { service } = await buildService({ placement: undefined });

    await expect(
      service.updateOutcome('missing', 'recovered'),
    ).rejects.toThrow('Placement missing not found');
  });
});
