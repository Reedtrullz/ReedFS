import { describe, expect, it } from 'vitest';
import { integrate } from '../integrate';
import { computeDerived } from '../derived';
import { eulerToQuat } from '../quaternion';
import { degToRad } from '../units';
import { B737_800_SPEC, createInitialState, type AircraftState, type ControlInputs } from '../../types';
import { applyIasFlightCondition } from './fdmFixtureHelpers';

const DT = 1 / 120;

const cruiseControls: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0.72,
  throttle2: 0.72,
  flapLever: 0,
  gearLever: 'UP',
  spoilers: 0,
  brake: 0,
};

function cruiseState(overrides: Partial<AircraftState> = {}): AircraftState {
  const state = createInitialState(B737_800_SPEC);
  applyIasFlightCondition(state, {
    iasKt: 240,
    altitudeFt: 10_000,
    angleOfAttackRad: degToRad(3),
    flapSetting: 0,
    gearDown: false,
  });
  state.ground = {
    ...state.ground,
    aglFt: 10_000,
    weightOnWheels: false,
    normalForceN: 0,
    onRunway: false,
    contact: 'none',
  };
  state.flightPhase = 'CRUISE';
  state.attitude = { phi: 0, theta: degToRad(3), psi: Math.PI / 2 };
  state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
  state.engines[0].n1 = 72;
  state.engines[1].n1 = 72;
  return Object.assign(state, overrides);
}

function runSeconds(state: AircraftState, seconds: number, controls: ControlInputs = cruiseControls): AircraftState[] {
  const samples: AircraftState[] = [];
  for (let i = 0; i < seconds / DT; i += 1) {
    integrate(state, controls, B737_800_SPEC, DT);
    if (i % 120 === 0) samples.push(structuredClone(state));
  }
  return samples;
}

function allFinite(samples: AircraftState[]): boolean {
  return samples.every((sample) => [
    sample.position.alt,
    sample.velocity.u,
    sample.velocity.v,
    sample.velocity.w,
    sample.attitude.phi,
    sample.attitude.theta,
    sample.attitude.psi,
    sample.angularVel.p,
    sample.angularVel.q,
    sample.angularVel.r,
  ].every(Number.isFinite));
}

describe('B737 dynamic-mode smoke tests', () => {
  it('keeps a broad phugoid perturbation finite and inside playable bounds', () => {
    const state = cruiseState();
    state.attitude.theta = degToRad(7);
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);

    const samples = runSeconds(state, 25);
    const final = samples.at(-1)!;
    const finalDerived = computeDerived(final);

    expect(allFinite(samples)).toBe(true);
    expect(Math.abs(final.position.alt - 10_000)).toBeLessThan(8_000);
    expect(finalDerived.ias).toBeGreaterThan(100);
    expect(finalDerived.ias).toBeLessThan(360);
    expect(Math.abs(final.attitude.theta)).toBeLessThan(degToRad(35));
  });

  it('damps a short-period pitch-rate kick instead of exploding', () => {
    const state = cruiseState();
    state.angularVel.q = 0.25;

    const samples = runSeconds(state, 6);
    const final = samples.at(-1)!;

    expect(allFinite(samples)).toBe(true);
    expect(Math.abs(final.angularVel.q)).toBeLessThan(0.25);
    expect(Math.abs(final.attitude.theta)).toBeLessThan(degToRad(30));
  });

  it('keeps dutch-roll sideslip/yaw perturbations bounded', () => {
    const state = cruiseState();
    applyIasFlightCondition(state, {
      iasKt: 240,
      altitudeFt: 10_000,
      angleOfAttackRad: degToRad(3),
      betaRad: degToRad(5),
      flapSetting: 0,
      gearDown: false,
    });
    state.angularVel.r = 0.12;

    const samples = runSeconds(state, 10);
    const final = samples.at(-1)!;
    const maxAbsBetaDeg = Math.max(...samples.map((sample) => Math.abs(computeDerived(sample).beta / degToRad(1))));

    expect(allFinite(samples)).toBe(true);
    expect(maxAbsBetaDeg).toBeLessThan(20);
    expect(Math.abs(final.angularVel.r)).toBeLessThan(0.5);
    expect(Math.abs(final.attitude.phi)).toBeLessThan(degToRad(45));
  });
});
