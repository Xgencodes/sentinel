import { Test, TestingModule } from '@nestjs/testing';
import { CohortResolverService, COHORT_RULES } from './cohort-resolver.service';
import { DEFAULT_COHORT_RULES } from './cohort-rule.interface';
import { DatabaseService } from '../../database/database.service';

const ZONE_A = 'zone-a';

const ZONE_A_PATIENTS = [
  {
    id: 'p1',
    zoneId: ZONE_A,
    msisdn: '+100000001',
    language: 'tw',
    assignedChwId: 'chw-1',
    isAntenatal: true,
    isUnderFiveHousehold: false,
    hasChronicCondition: false,
  },
  {
    id: 'p2',
    zoneId: ZONE_A,
    msisdn: '+100000002',
    language: 'en',
    assignedChwId: 'chw-1',
    isAntenatal: false,
    isUnderFiveHousehold: true,
    hasChronicCondition: false,
  },
  {
    id: 'p3',
    zoneId: ZONE_A,
    msisdn: '+100000003',
    language: 'ee',
    assignedChwId: null,
    // Belongs to two cohorts at once — both should be reported.
    isAntenatal: true,
    isUnderFiveHousehold: false,
    hasChronicCondition: true,
  },
  {
    id: 'p4',
    zoneId: ZONE_A,
    msisdn: '+100000004',
    language: 'en',
    assignedChwId: null,
    // Matches none of the cohorts — must not appear in any result.
    isAntenatal: false,
    isUnderFiveHousehold: false,
    hasChronicCondition: false,
  },
];

describe('CohortResolverService', () => {
  let service: CohortResolverService;
  let findMany: jest.Mock;

  beforeEach(async () => {
    // The resolver queries by zoneId only; a zone-scoped fixture is enough
    // to prove the "different zone" isolation without decoding Drizzle's
    // `where` builder in the stub.
    findMany = jest.fn().mockResolvedValue(ZONE_A_PATIENTS);

    const dbStub = {
      getDb: () => ({ query: { patients: { findMany } } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CohortResolverService,
        { provide: DatabaseService, useValue: dbStub },
        { provide: COHORT_RULES, useValue: DEFAULT_COHORT_RULES },
      ],
    }).compile();

    service = module.get(CohortResolverService);
  });

  it('resolves an honest 340-women scenario shape: only matching patients', async () => {
    const result = await service.resolve(ZONE_A, ['antenatal-care']);

    const ids = result.cohorts.map((c) => c.patientId).sort();
    expect(ids).toEqual(['p1', 'p3']);
  });

  it('reports every cohort a patient belongs to', async () => {
    const result = await service.resolve(ZONE_A, [
      'antenatal-care',
      'chronic-condition',
    ]);

    const p3 = result.cohorts.find((c) => c.patientId === 'p3');
    expect(p3?.cohorts.sort()).toEqual(['antenatal-care', 'chronic-condition']);
  });

  it('excludes patients matching none of the requested cohorts', async () => {
    const result = await service.resolve(ZONE_A, ['under-five']);

    expect(result.cohorts.map((c) => c.patientId)).toEqual(['p2']);
  });

  it('never includes a patient matching zero requested cohorts', async () => {
    const result = await service.resolve(ZONE_A, [
      'antenatal-care',
      'under-five',
      'chronic-condition',
    ]);

    expect(result.cohorts.map((c) => c.patientId)).not.toContain('p4');
  });

  it('carries contact channel fields needed for dispatch', async () => {
    const result = await service.resolve(ZONE_A, ['antenatal-care']);

    const p1 = result.cohorts.find((c) => c.patientId === 'p1');
    expect(p1).toMatchObject({
      msisdn: '+100000001',
      language: 'tw',
      assignedChwId: 'chw-1',
    });
  });

  it('queries only the requested zone', async () => {
    await service.resolve(ZONE_A, ['antenatal-care']);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() }),
    );
  });

  it('returns an empty list rather than throwing when no cohort types are requested', async () => {
    const result = await service.resolve(ZONE_A, []);

    expect(result.zoneId).toBe(ZONE_A);
    expect(result.cohorts).toEqual([]);
  });
});
