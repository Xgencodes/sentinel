import { Test, TestingModule } from '@nestjs/testing';
import {
  FacilityRouterService,
  ROAD_ACCESS_ADAPTER,
} from './facility-router.service';
import { SyntheticRoadAccessAdapter } from './road-access.adapter';
import { DatabaseService } from '../../database/database.service';

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

  async function buildService(facilities: any[]) {
    findMany = jest.fn().mockResolvedValue(facilities);
    roadAccess = new SyntheticRoadAccessAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacilityRouterService,
        {
          provide: DatabaseService,
          useValue: { getDb: () => ({ query: { facilities: { findMany } } }) },
        },
        { provide: ROAD_ACCESS_ADAPTER, useValue: roadAccess },
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
});
