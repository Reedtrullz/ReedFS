import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, createInitialState } from '../types';
import { isPositiveRateEstablished } from '../flightPhasePredicates';

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
