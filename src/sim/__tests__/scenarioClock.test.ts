import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, createInitialState, type ControlInputs } from '../types';
import { integrate } from '../physics/integrate';
import { computeSunPosition } from '../sun';
import { hasCoherentScenarioClock, parseScenarioUtc, scenarioUtcMs, utcHours } from '../scenarioClock';
import { isAircraftState } from '../simulationValidation';

const idle: ControlInputs = { elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 1 };

describe('scenario UTC regression', () => {
  it('advances one UTC minute for sixty committed simulated seconds', () => {
    const state = createInitialState(B737_800_SPEC);
    for (let i = 0; i < 600; i++) integrate(state, idle, B737_800_SPEC, 0.1);
    expect(state.simTime).toBeCloseTo(60000, 6);
    expect(state.timeOfDay).toBeCloseTo(12 + 1 / 60, 9);
  });

  it('crosses UTC day/year boundaries and rejects inconsistent aircraft clocks', () => {
    const state = createInitialState(B737_800_SPEC);
    state.utcEpochMs = Date.UTC(2026, 11, 31, 23, 59, 59); state.timeOfDay = utcHours(state.utcEpochMs);
    for (let i = 0; i < 20; i++) integrate(state, idle, B737_800_SPEC, 0.1);
    expect(new Date(scenarioUtcMs(state)).toISOString()).toBe('2027-01-01T00:00:01.000Z');
    expect(hasCoherentScenarioClock(state)).toBe(true); expect(isAircraftState(state)).toBe(true);
    state.timeOfDay = 12; expect(isAircraftState(state)).toBe(false);
    state.timeOfDay = utcHours(scenarioUtcMs(state)); state.utcEpochMs = NaN; expect(isAircraftState(state)).toBe(false);
  });

  it('rejects cancellation-prone remote anchors even if their sum could resolve to an applicable UTC', () => {
    const state = createInitialState(B737_800_SPEC); state.utcEpochMs = -1e20; state.simTime = 1e20 + Date.UTC(2026, 8, 24, 12);
    state.timeOfDay = utcHours(scenarioUtcMs(state)); expect(hasCoherentScenarioClock(state)).toBe(false);
  });

  it('accepts only canonical UTC dates in the supported date domain', () => {
    expect(parseScenarioUtc('2028-02-29T12:01:02.003Z')).toBe(Date.UTC(2028, 1, 29, 12, 1, 2, 3));
    expect(parseScenarioUtc('2026-02-29T12:00Z')).toBeNull();
    expect(parseScenarioUtc('2026-09-24T12:00+02:00')).toBeNull();
    expect(parseScenarioUtc('1899-12-31T23:59:59Z')).toBeNull();
  });

  it('uses geographic hemisphere and longitude for a fixed summer instant', () => {
    const noon = Date.UTC(2026, 5, 21, 12);
    expect(computeSunPosition(60, 0, noon).elevation).toBeGreaterThan(computeSunPosition(-60, 0, noon).elevation);
    expect(computeSunPosition(0, 0, noon).elevation).toBeGreaterThan(0.9);
    expect(computeSunPosition(0, 180, noon).elevation).toBeLessThan(-0.9);
  });

});
