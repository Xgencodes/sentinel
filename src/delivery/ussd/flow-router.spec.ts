import { UssdFlowRouter } from './flow-router';
import { PatientSelfRegistrationFlow } from './patient-self-registration.flow';
import { ChwVisitListFlow } from './chw-visit-list.flow';

function buildRouter() {
  const zonesService = {
    findAll: jest.fn(async () => [{ id: 'z1', name: 'Zone One' }]),
  };
  const patientsService = {
    create: jest.fn(async (req: any) => ({ id: 'patient-1', ...req })),
    recordConsent: jest.fn(async (req: any) => req),
  };
  const registrationFlow = new PatientSelfRegistrationFlow(
    patientsService as any,
    zonesService as any,
  );

  const dbStub = {
    getDb: () => ({
      query: {
        providers: {
          findFirst: jest.fn().mockResolvedValue({ id: 'chw-1', role: 'chw' }),
        },
        patients: { findMany: jest.fn().mockResolvedValue([]) },
      },
    }),
  };
  const chwFlow = new ChwVisitListFlow(dbStub as any);

  return {
    router: new UssdFlowRouter(registrationFlow, chwFlow),
    patientsService,
  };
}

describe('UssdFlowRouter', () => {
  it('shows the top-level menu on session start', async () => {
    const { router } = buildRouter();

    const result = await router.start('+1');

    expect(result.text).toContain('Register as a patient');
    expect(result.text).toContain('CHW visit list');
    expect(result.state.step).toBe('root');
  });

  it('re-prompts on an invalid menu choice at the root', async () => {
    const { router } = buildRouter();
    const start = await router.start('+1');

    const result = await router.handle('+1', start.state, '9');

    expect(result.continueSession).toBe(true);
    expect(result.state.step).toBe('root');
  });

  it('routes option 1 into the registration flow and keeps routing subsequent input into it', async () => {
    const { router, patientsService } = buildRouter();
    let result = await router.start('+1');

    result = await router.handle('+1', result.state, '1'); // enter registration
    expect(result.state.step).toBe('in-flow');
    expect(result.text).toMatch(/language/i);

    result = await router.handle('+1', result.state, '1'); // English
    result = await router.handle('+1', result.state, '1'); // agree to consent
    expect(result.text).toContain('Zone One');

    result = await router.handle('+1', result.state, '1'); // select the only zone
    result = await router.handle('+1', result.state, '4'); // no cohort

    expect(result.continueSession).toBe(false);
    expect(patientsService.create).toHaveBeenCalledTimes(1);
  });

  it('routes option 2 into the CHW visit list flow and ends the session immediately', async () => {
    const { router } = buildRouter();
    let result = await router.start('+1');

    result = await router.handle('+1', result.state, '2');

    expect(result.continueSession).toBe(false);
    expect(result.text).toContain('no patients assigned');
  });

  it('recovers gracefully if the in-flow state references an unknown flow', async () => {
    const { router } = buildRouter();

    const result = await router.handle(
      '+1',
      { step: 'in-flow', data: { flowId: 'ghost', inner: {} } },
      'anything',
    );

    expect(result.continueSession).toBe(false);
    expect(result.text).toContain('Something went wrong');
  });
});
