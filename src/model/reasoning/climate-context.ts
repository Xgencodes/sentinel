export type TransmissionWindow = 'post-flood-malaria' | 'diarrhoeal' | 'none';

export interface ZoneTriggerSnapshot {
  band: 'low' | 'medium' | 'high';
  standingWaterDays: number;
}

export interface ClimateContext {
  zoneId: string;
  band: 'low' | 'medium' | 'high';
  transmissionWindow: TransmissionWindow;
  standingWaterDays: number;
  roadAccessible: boolean;
}

/**
 * Assembles the structured context that gets injected into every clinical
 * prompt, so a reported fever in a flood-affected zone during the post-flood
 * malaria window is weighted differently than the same fever in a dry
 * month — and so an interrupted antenatal schedule escalates faster when
 * the road is out. The adjustment is made here, in code, rather than left
 * implicit inside a prompt string, so it's inspectable and testable.
 */
export function buildClimateContext(
  zoneId: string,
  trigger: ZoneTriggerSnapshot,
  roadAccessible: boolean,
): ClimateContext {
  const transmissionWindow: TransmissionWindow =
    trigger.standingWaterDays >= 1
      ? 'post-flood-malaria'
      : trigger.band !== 'low'
        ? 'diarrhoeal'
        : 'none';

  return {
    zoneId,
    band: trigger.band,
    transmissionWindow,
    standingWaterDays: trigger.standingWaterDays,
    roadAccessible,
  };
}

/**
 * How much the escalation policy should lower its bar given climate
 * context — 0 means no adjustment, higher means escalate more readily.
 * Kept as a small integer "steps" value so the policy can apply it
 * uniformly regardless of the underlying severity scale.
 */
export function escalationSensitivityBoost(context: ClimateContext): number {
  let boost = 0;
  if (context.transmissionWindow === 'post-flood-malaria') {
    boost += 1;
  }
  if (context.transmissionWindow === 'diarrhoeal') {
    boost += 1;
  }
  if (!context.roadAccessible) {
    // An interrupted antenatal schedule (or any follow-up) escalates faster
    // when the road is out, since routine follow-up isn't a fallback.
    boost += 1;
  }
  return boost;
}
