import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, type AircraftState, type ControlInputs } from '../../types';
import { createAircraftStateForScenario, SCENARIOS, type FlightScenario } from '../../scenarios';
import { computeAero } from '../aero';
import { computeEngineThrustN } from '../../systems/engine';
import { b737PerformanceCards, assertPerformanceCardMatchesScenario } from '../../data/performance/b737PerformanceCards';
import { radToDeg } from '../units';

const KNOT_TO_MPS = 0.514444;
const MPS_TO_FPM = 196.850394;

const neutralControls: ControlInputs = {
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

function scenarioForCard(scenarioId: string): FlightScenario {
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error(`Missing scenario ${scenarioId}`);
  return scenario;
}

function createCardState(scenario: FlightScenario): AircraftState {
  return createAircraftStateForScenario(B737_800_SPEC, scenario);
}

function estimateExcessPowerClimbFpm(state: AircraftState, iasKt: number, n1Percent: number): number {
  state.velocity = { u: iasKt * KNOT_TO_MPS, v: 0, w: 0 };
  const mach = state.velocity.u / 340;
  const thrustPerEngine = computeEngineThrustN(n1Percent, B737_800_SPEC, state.position.alt, mach);
  state.engines[0].thrust = thrustPerEngine;
  state.engines[1].thrust = thrustPerEngine;
  const aero = computeAero(state, neutralControls, B737_800_SPEC);
  const excessForwardForceN = aero.thrust + aero.dragBodyX;
  return (excessForwardForceN * state.velocity.u / aero.weight) * MPS_TO_FPM;
}

function findLevelApproachAoADeg(state: AircraftState, iasKt: number): number {
  const speedMps = iasKt * KNOT_TO_MPS;
  let low = -5 * Math.PI / 180;
  let high = 15 * Math.PI / 180;

  for (let i = 0; i < 50; i += 1) {
    const mid = (low + high) / 2;
    state.velocity = {
      u: speedMps * Math.cos(mid),
      v: 0,
      w: speedMps * Math.sin(mid),
    };
    const aero = computeAero(state, { ...neutralControls, flapLever: state.config.flapSetting, gearLever: 'DOWN' }, B737_800_SPEC);
    if (aero.lift / aero.weight < 1) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return radToDeg((low + high) / 2);
}

describe('B737 performance card physics assertions', () => {
  it.each(b737PerformanceCards)('keeps $scenarioId card synchronized with its scenario', (card) => {
    expect(() => assertPerformanceCardMatchesScenario(card, scenarioForCard(card.scenarioId))).not.toThrow();
  });

  it.each(b737PerformanceCards)('$scenarioId clean climb card is positive but not rocket-like', (card) => {
    const state = createCardState(scenarioForCard(card.scenarioId));
    state.position.alt = card.cleanClimb.altitudeFt;
    state.config.flapSetting = 0;
    state.config.gearDown = false;
    state.config.speedBrake = 0;
    state.ground = { ...state.ground, groundAltFt: 0, weightOnWheels: false, contact: 'none' };

    const climbFpm = estimateExcessPowerClimbFpm(state, card.cleanClimb.iasKt, card.cleanClimb.n1Percent);

    expect(climbFpm).toBeGreaterThanOrEqual(card.cleanClimb.expectedClimbFpm[0]);
    expect(climbFpm).toBeLessThanOrEqual(card.cleanClimb.expectedClimbFpm[1]);
  });

  it.each(b737PerformanceCards)('$scenarioId approach card does not require impossible AoA', (card) => {
    const state = createCardState(scenarioForCard(card.scenarioId));
    state.position.alt = state.ground.groundAltFt + card.approach.heightAglFt;
    state.config.flapSetting = card.approach.flapSetting;
    state.config.gearDown = true;
    state.config.speedBrake = 0;

    const aoaDeg = findLevelApproachAoADeg(state, card.approach.iasKt);

    expect(aoaDeg).toBeGreaterThanOrEqual(card.approach.expectedAoADeg[0]);
    expect(aoaDeg).toBeLessThanOrEqual(card.approach.expectedAoADeg[1]);
  });
});
