import { ChwVisitListFlow } from './chw-visit-list.flow';

function buildFlow(chw: any, assigned: any[]) {
  const db = {
    getDb: () => ({
      query: {
        providers: { findFirst: jest.fn().mockResolvedValue(chw) },
        patients: { findMany: jest.fn().mockResolvedValue(assigned) },
      },
    }),
  };
  return new ChwVisitListFlow(db as any);
}

describe('ChwVisitListFlow', () => {
  it('rejects a number that is not a registered CHW', async () => {
    const flow = buildFlow(undefined, []);

    const result = await flow.start('+1');

    expect(result.continueSession).toBe(false);
    expect(result.text).toContain('not registered');
  });

  it('rejects a registered provider who is a doctor, not a CHW', async () => {
    const flow = buildFlow({ id: 'prov-1', role: 'doctor' }, []);

    const result = await flow.start('+1');

    expect(result.text).toContain('not registered');
  });

  it('reports no patients assigned when the list is empty', async () => {
    const flow = buildFlow({ id: 'chw-1', role: 'chw' }, []);

    const result = await flow.start('+1');

    expect(result.text).toContain('no patients assigned');
  });

  it('lists assigned patients with their cohort', async () => {
    const flow = buildFlow({ id: 'chw-1', role: 'chw' }, [
      {
        msisdn: '+100',
        isAntenatal: true,
        isUnderFiveHousehold: false,
        hasChronicCondition: false,
      },
      {
        msisdn: '+101',
        isAntenatal: false,
        isUnderFiveHousehold: true,
        hasChronicCondition: false,
      },
    ]);

    const result = await flow.start('+1');

    expect(result.text).toContain('+100 (ANC)');
    expect(result.text).toContain('+101 (U5)');
    expect(result.continueSession).toBe(false);
  });

  it('truncates to five patients on one screen', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      msisdn: `+${i}`,
      isAntenatal: false,
      isUnderFiveHousehold: false,
      hasChronicCondition: false,
    }));
    const flow = buildFlow({ id: 'chw-1', role: 'chw' }, many);

    const result = await flow.start('+1');

    expect(result.text.split('\n')).toHaveLength(6); // header + 5 lines
  });
});
