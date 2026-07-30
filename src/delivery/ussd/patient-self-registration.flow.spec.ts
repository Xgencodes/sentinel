import { PatientSelfRegistrationFlow } from './patient-self-registration.flow';
import { UssdSessionState } from './flow.interface';

const ZONES = [
  { id: 'zone-1', name: 'Riverside District' },
  { id: 'zone-2', name: 'Highland District' },
];

function buildFlow() {
  const created: any[] = [];
  const consents: any[] = [];

  const patientsService = {
    create: jest.fn(async (request: any) => {
      const patient = { id: `patient-${created.length + 1}`, ...request };
      created.push(patient);
      return patient;
    }),
    recordConsent: jest.fn(async (request: any) => {
      consents.push(request);
      return request;
    }),
  };
  const zonesService = { findAll: jest.fn(async () => ZONES) };

  const flow = new PatientSelfRegistrationFlow(
    patientsService as any,
    zonesService as any,
  );

  return { flow, created, consents, patientsService, zonesService };
}

async function step(
  flow: PatientSelfRegistrationFlow,
  state: UssdSessionState,
  msisdn: string,
  input: string,
) {
  return flow.handle(msisdn, state, input);
}

describe('PatientSelfRegistrationFlow — happy path', () => {
  it('registers a patient after language, consent, zone and cohort, and records consent', async () => {
    const { flow, created, consents } = buildFlow();
    const msisdn = '+15555550100';

    let result = await flow.start(msisdn);
    expect(result.text).toContain('Choose your language');

    result = await step(flow, result.state, msisdn, '2'); // Twi
    expect(result.text).toMatch(/Sentinel bɛfrɛ wo/); // Twi consent text
    expect(result.continueSession).toBe(true);

    result = await step(flow, result.state, msisdn, '1'); // agree to consent
    expect(result.text).toContain('Riverside District');
    expect(result.text).toContain('Highland District');

    result = await step(flow, result.state, msisdn, '2'); // Highland District
    expect(result.text).toMatch(/Wo yɛ:/); // Twi cohort menu

    result = await step(flow, result.state, msisdn, '1'); // pregnant
    expect(result.continueSession).toBe(false);
    expect(result.text).toContain('registered');

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      msisdn,
      zoneId: 'zone-2',
      language: 'tw',
      isAntenatal: true,
      isUnderFiveHousehold: false,
      hasChronicCondition: false,
      registrationProvenance: 'self-ussd',
    });

    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({
      patientId: 'patient-1',
      channel: 'ussd',
      granted: true,
    });
    expect(consents[0].consentText.length).toBeGreaterThan(0);
  });
});

describe('PatientSelfRegistrationFlow — decline path', () => {
  it('ends the session and creates no patient when consent is declined', async () => {
    const { flow, created, consents } = buildFlow();
    const msisdn = '+15555550100';

    let result = await flow.start(msisdn);
    result = await step(flow, result.state, msisdn, '1'); // English
    result = await step(flow, result.state, msisdn, '2'); // decline

    expect(result.continueSession).toBe(false);
    expect(result.text).toContain('not been registered');
    expect(created).toHaveLength(0);
    expect(consents).toHaveLength(0);
  });
});

describe('PatientSelfRegistrationFlow — invalid input handling', () => {
  it('re-prompts on an invalid language choice without crashing', async () => {
    const { flow } = buildFlow();
    let result = await flow.start('+1');

    result = await step(flow, result.state, '+1', '9');

    expect(result.continueSession).toBe(true);
    expect(result.state.step).toBe('language');
    expect(result.text).toContain('1, 2 or 3');
  });

  it('re-prompts on an invalid consent choice', async () => {
    const { flow } = buildFlow();
    let result = await flow.start('+1');
    result = await step(flow, result.state, '+1', '1');

    result = await step(flow, result.state, '+1', 'x');

    expect(result.continueSession).toBe(true);
    expect(result.state.step).toBe('consent');
  });

  it('re-prompts on an out-of-range zone choice', async () => {
    const { flow } = buildFlow();
    let result = await flow.start('+1');
    result = await step(flow, result.state, '+1', '1');
    result = await step(flow, result.state, '+1', '1');

    result = await step(flow, result.state, '+1', '99');

    expect(result.continueSession).toBe(true);
    expect(result.state.step).toBe('zone');
  });

  it('re-prompts on an invalid cohort choice', async () => {
    const { flow, created } = buildFlow();
    let result = await flow.start('+1');
    result = await step(flow, result.state, '+1', '1');
    result = await step(flow, result.state, '+1', '1');
    result = await step(flow, result.state, '+1', '1');

    result = await step(flow, result.state, '+1', '9');

    expect(result.continueSession).toBe(true);
    expect(created).toHaveLength(0);
  });

  it('recovers from an unknown session step rather than throwing', async () => {
    const { flow } = buildFlow();

    const result = await flow.handle(
      '+1',
      { step: 'nonexistent', data: {} },
      'anything',
    );

    expect(result.continueSession).toBe(false);
    expect(result.text).toContain('Something went wrong');
  });
});

describe('PatientSelfRegistrationFlow — cohort selection', () => {
  it.each([
    [
      '1',
      {
        isAntenatal: true,
        isUnderFiveHousehold: false,
        hasChronicCondition: false,
      },
    ],
    [
      '2',
      {
        isAntenatal: false,
        isUnderFiveHousehold: true,
        hasChronicCondition: false,
      },
    ],
    [
      '3',
      {
        isAntenatal: false,
        isUnderFiveHousehold: false,
        hasChronicCondition: true,
      },
    ],
    [
      '4',
      {
        isAntenatal: false,
        isUnderFiveHousehold: false,
        hasChronicCondition: false,
      },
    ],
  ])('maps cohort choice %s correctly', async (choice, expected) => {
    const { flow, created } = buildFlow();
    let result = await flow.start('+1');
    result = await step(flow, result.state, '+1', '1');
    result = await step(flow, result.state, '+1', '1');
    result = await step(flow, result.state, '+1', '1');
    await step(flow, result.state, '+1', choice);

    expect(created[0]).toMatchObject(expected);
  });
});
