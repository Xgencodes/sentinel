import { EscalationPolicy, EscalationInput } from './escalation-policy';
import { ClimateContext } from './climate-context';

const CALM_CONTEXT: ClimateContext = {
  zoneId: 'z1',
  band: 'low',
  transmissionWindow: 'none',
  standingWaterDays: 0,
  roadAccessible: true,
};

const FLOOD_CONTEXT: ClimateContext = {
  zoneId: 'z1',
  band: 'high',
  transmissionWindow: 'post-flood-malaria',
  standingWaterDays: 3,
  roadAccessible: false,
};

function input(overrides: Partial<EscalationInput>): EscalationInput {
  return {
    severity: 'low',
    isAntenatal: false,
    pregnancyDangerSignMentioned: false,
    climateContext: CALM_CONTEXT,
    ...overrides,
  };
}

describe('EscalationPolicy — pregnancy safety floor', () => {
  const policy = new EscalationPolicy();

  it('escalates a pregnancy danger sign even when the model rated it low severity', () => {
    const decision = policy.decide(
      input({
        severity: 'low',
        isAntenatal: true,
        pregnancyDangerSignMentioned: true,
        climateContext: CALM_CONTEXT,
      }),
    );

    expect(decision.action).toBe('escalate');
    expect(decision.forcedBySafetyRule).toBe('pregnancy-danger-sign-floor');
  });

  it('escalates a pregnancy danger sign regardless of climate context', () => {
    const decision = policy.decide(
      input({
        isAntenatal: true,
        pregnancyDangerSignMentioned: true,
        climateContext: FLOOD_CONTEXT,
      }),
    );

    expect(decision.action).toBe('escalate');
  });

  it('does not force escalation for a non-antenatal patient with the same symptom text', () => {
    // Guards against the floor accidentally firing on symptom keywords
    // alone, independent of cohort membership.
    const decision = policy.decide(
      input({
        severity: 'low',
        isAntenatal: false,
        pregnancyDangerSignMentioned: true,
      }),
    );

    expect(decision.forcedBySafetyRule).toBeUndefined();
  });

  it('does not force escalation for an antenatal patient with no danger sign', () => {
    const decision = policy.decide(
      input({
        severity: 'low',
        isAntenatal: true,
        pregnancyDangerSignMentioned: false,
      }),
    );

    expect(decision.forcedBySafetyRule).toBeUndefined();
    expect(decision.action).toBe('guidance');
  });

  it.each(['low', 'medium', 'high'] as const)(
    'the floor overrides every severity level (%s)',
    (severity) => {
      const decision = policy.decide(
        input({
          severity,
          isAntenatal: true,
          pregnancyDangerSignMentioned: true,
        }),
      );

      expect(decision.action).toBe('escalate');
    },
  );
});

describe('EscalationPolicy — climate-sensitive threshold', () => {
  const policy = new EscalationPolicy();

  it('does not escalate low severity in a calm context', () => {
    const decision = policy.decide(
      input({ severity: 'low', climateContext: CALM_CONTEXT }),
    );
    expect(decision.action).toBe('guidance');
  });

  it('escalates the same low severity when the road is out during a flood', () => {
    // This is the literal "identical symptom, different escalation" case
    // the climate-context design is for.
    const decision = policy.decide(
      input({ severity: 'low', climateContext: FLOOD_CONTEXT }),
    );
    expect(decision.action).not.toBe('guidance');
  });

  it('escalates medium severity to escalate (not just followUp) inside a transmission window', () => {
    const calm = policy.decide(
      input({ severity: 'medium', climateContext: CALM_CONTEXT }),
    );
    const flood = policy.decide(
      input({ severity: 'medium', climateContext: FLOOD_CONTEXT }),
    );

    expect(calm.action).toBe('followUp');
    expect(flood.action).toBe('escalate');
  });

  it('always escalates high severity regardless of climate context', () => {
    expect(
      policy.decide(input({ severity: 'high', climateContext: CALM_CONTEXT }))
        .action,
    ).toBe('escalate');
    expect(
      policy.decide(input({ severity: 'high', climateContext: FLOOD_CONTEXT }))
        .action,
    ).toBe('escalate');
  });
});
