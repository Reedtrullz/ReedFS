import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, createInitialState } from '../types';
import { isPositiveRateEstablished } from '../flightPhasePredicates';
import { eulerToQuat } from '../physics/quaternion';

describe('isPositiveRateEstablished', () => {
  it('is false when airborne but descending above the runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = 2;

    expect(isPositiveRateEstablished(state)).toBe(false);
  });

  it('is true only after gear is unloaded and vertical speed is upward', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = -1.5;

    expect(isPositiveRateEstablished(state)).toBe(true);
  });

  it('is true when pitched climb creates upward NED vertical speed with zero body w', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.u = 75;
    state.velocity.w = 0;
    state.attitude.theta = 5 * Math.PI / 180;
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);

    expect(isPositiveRateEstablished(state)).toBe(true);
  });

  it('is false at the upward NED vertical speed boundary', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = -0.25;

    expect(isPositiveRateEstablished(state)).toBe(false);
  });

  it('is false when still weight-on-wheels even with upward body w', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = true;
    state.ground.aglFt = 80;
    state.velocity.w = -1.5;

    expect(isPositiveRateEstablished(state)).toBe(false);
  });

  it('is false when airborne but AGL is not above the minimum threshold', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.velocity.w = -1.5;

    state.ground.aglFt = 10;
    expect(isPositiveRateEstablished(state)).toBe(false);

    state.ground.aglFt = 0;
    expect(isPositiveRateEstablished(state)).toBe(false);
  });
});
