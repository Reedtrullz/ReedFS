import { describe, expect, it } from 'vitest';
import { b737TrimFixtures } from '../../data/performance/b737TrimFixtures';
import { B737_800_SPEC, createInitialState, type AircraftState, type ControlInputs } from '../../types';
import { computeAero } from '../aero';
import { solvePitchTrimForState } from '../trimSolver';

const KNOT_TO_MPS = 0.514444;
const zeroInputs: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0,
  throttle2: 0,
  flapLever: 0,
  gearLever: 'UP',
  spoilers: 0,
  brake: 0,
};

function stateForFixture(): AircraftState {
  const fixture = b737TrimFixtures[0];
  const state = createInitialState(B737_800_SPEC);
  state.position.alt = fixture.altitudeFt;
  state.grossWeight = fixture.grossWeightKg;
  state.cg = fixture.cgPercentMac;
  state.config.flapSetting = fixture.flapSetting;
  state.config.gearDown = fixture.gearDown;
  state.config.speedBrake = 0;
  state.config.stabilizerTrimUnits = 0;
  state.velocity.u = fixture.iasKt * KNOT_TO_MPS;
  state.velocity.v = 0;
  state.velocity.w = Math.tan(fixture.angleOfAttackRad) * state.velocity.u;
  return state;
}

describe('B737 trim solver fixtures', () => {
  it('defines a clean level-flight trim fixture with protective expected bounds', () => {
    expect(b737TrimFixtures).toHaveLength(1);
    expect(b737TrimFixtures[0].id).toBe('b737-800-clean-220kt-10000ft');
    expect(b737TrimFixtures[0].expectedTrimUnits).toEqual([2, 4]);
    expect(b737TrimFixtures[0].expectedLiftToWeight).toEqual([0.97, 1.03]);
  });

  it('solves stabilizer trim to near-zero pitch moment for the fixture', () => {
    const fixture = b737TrimFixtures[0];
    const state = stateForFixture();

    const solution = solvePitchTrimForState(state, zeroInputs, B737_800_SPEC);
    state.config.stabilizerTrimUnits = solution.stabilizerTrimUnits;
    const trimmedAero = computeAero(state, { ...zeroInputs, elevator: solution.elevator }, B737_800_SPEC);

    expect(solution.converged).toBe(true);
    expect(solution.elevator).toBe(0);
    expect(solution.stabilizerTrimUnits).toBeGreaterThanOrEqual(fixture.expectedTrimUnits[0]);
    expect(solution.stabilizerTrimUnits).toBeLessThanOrEqual(fixture.expectedTrimUnits[1]);
    expect(Math.abs(solution.pitchMomentNm)).toBeLessThan(1_000);
    expect(trimmedAero.lift / trimmedAero.weight).toBeGreaterThanOrEqual(fixture.expectedLiftToWeight[0]);
    expect(trimmedAero.lift / trimmedAero.weight).toBeLessThanOrEqual(fixture.expectedLiftToWeight[1]);
  });
});
