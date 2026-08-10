import { Test, TestingModule } from '@nestjs/testing';
import { PatientsService } from './patients.service';
import { DatabaseService } from '../../database/database.service';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';

describe('PatientsService.updateHomeFacility', () => {
  function whereResult(rows: any[]) {
    const promise = Promise.resolve(rows) as any;
    promise.returning = () => Promise.resolve(rows);
    return promise;
  }

  async function buildService(patient: any) {
    const findFirstPatient = jest.fn().mockResolvedValue(patient);
    const updateCalls: { set: any }[] = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        {
          provide: DatabaseService,
          useValue: {
            getDb: () => ({
              query: { patients: { findFirst: findFirstPatient } },
              update: () => ({
                set: (set: any) => {
                  updateCalls.push({ set });
                  const rows = patient ? [{ ...patient, ...set }] : [];
                  return { where: () => whereResult(rows) };
                },
              }),
            }),
          },
        },
        { provide: SENTINEL_TELEMETRY, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    return { service: module.get(PatientsService), updateCalls };
  }

  it('sets the home facility and returns the updated patient', async () => {
    const patient = { id: 'patient-1', homeFacilityId: null };
    const { service, updateCalls } = await buildService(patient);

    const result = await service.updateHomeFacility('patient-1', 'facility-1');

    expect(result.homeFacilityId).toBe('facility-1');
    expect(updateCalls).toEqual([
      { set: { homeFacilityId: 'facility-1' } },
    ]);
  });

  it('throws NotFoundException when the patient does not exist', async () => {
    const { service } = await buildService(undefined);

    await expect(
      service.updateHomeFacility('missing', 'facility-1'),
    ).rejects.toThrow('Patient missing not found');
  });
});
