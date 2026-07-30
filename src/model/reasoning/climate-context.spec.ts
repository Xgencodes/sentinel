import {
  buildClimateContext,
  escalationSensitivityBoost,
} from './climate-context';

describe('buildClimateContext', () => {
  it('identifies a post-flood malaria window when standing water is present', () => {
    const context = buildClimateContext(
      'z1',
      { band: 'high', standingWaterDays: 2 },
      true,
    );
    expect(context.transmissionWindow).toBe('post-flood-malaria');
  });

  it('identifies a diarrhoeal window when the band is elevated but no standing water', () => {
    const context = buildClimateContext(
      'z1',
      { band: 'medium', standingWaterDays: 0 },
      true,
    );
    expect(context.transmissionWindow).toBe('diarrhoeal');
  });

  it('identifies no transmission window in a calm, low-band zone', () => {
    const context = buildClimateContext(
      'z1',
      { band: 'low', standingWaterDays: 0 },
      true,
    );
    expect(context.transmissionWindow).toBe('none');
  });

  it('carries road accessibility through unchanged', () => {
    const accessible = buildClimateContext(
      'z1',
      { band: 'low', standingWaterDays: 0 },
      true,
    );
    const blocked = buildClimateContext(
      'z1',
      { band: 'low', standingWaterDays: 0 },
      false,
    );
    expect(accessible.roadAccessible).toBe(true);
    expect(blocked.roadAccessible).toBe(false);
  });
});

describe('escalationSensitivityBoost', () => {
  it('is zero with no transmission window and a passable road', () => {
    const boost = escalationSensitivityBoost({
      zoneId: 'z1',
      band: 'low',
      transmissionWindow: 'none',
      standingWaterDays: 0,
      roadAccessible: true,
    });
    expect(boost).toBe(0);
  });

  it('increases for a transmission window', () => {
    const boost = escalationSensitivityBoost({
      zoneId: 'z1',
      band: 'high',
      transmissionWindow: 'post-flood-malaria',
      standingWaterDays: 2,
      roadAccessible: true,
    });
    expect(boost).toBeGreaterThan(0);
  });

  it('increases further when the road is also impassable', () => {
    const windowOnly = escalationSensitivityBoost({
      zoneId: 'z1',
      band: 'high',
      transmissionWindow: 'post-flood-malaria',
      standingWaterDays: 2,
      roadAccessible: true,
    });
    const windowAndRoad = escalationSensitivityBoost({
      zoneId: 'z1',
      band: 'high',
      transmissionWindow: 'post-flood-malaria',
      standingWaterDays: 2,
      roadAccessible: false,
    });
    expect(windowAndRoad).toBeGreaterThan(windowOnly);
  });
});
