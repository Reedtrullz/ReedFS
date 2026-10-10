import { describe, expect, it } from 'vitest';

import { B737_800_SPEC, createInitialState, type AircraftState, type ControlInputs } from '../../types';
import { computeAero } from '../aero';
import { integrate } from '../integrate';
import { eulerToQuat } from '../quaternion';

const deg = Math.PI / 180;
const G = 9.80665;

function airborneAt(aoaDeg: number, speedMs = 100): AircraftState {
  const s = createInitialState(B737_800_SPEC);
  s.position.alt = 10_000;
  const aoa = aoaDeg * deg;
  s.attitude = { phi: 0, theta: aoa, psi: 0 };
  s.quaternion = eulerToQuat(0, aoa, 0);
  s.velocity = { u: speedMs * Math.cos(aoa), v: 0, w: speedMs * Math.sin(aoa) };
  s.config.gearDown = false;
  s.config.gearPosition = 0;
  s.config.flapSetting = 0;
  s.ground = { ...s.ground, aglFt: 10_000, weightOnWheels: false, contact: 'none' };
  s.flightPhase = 'CRUISE';
  for (const engine of s.engines) engine.thrust = 0;
  return s;
}

const zeroControls: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'UP', spoilers: 0, brake: 0,
};

describe('analytic force-frame conventions', () => {
  it('resolves drag opposite the air-relative velocity at nonzero AoA', () => {
    const s = airborneAt(6, 100);
    const a = computeAero(s, zeroControls, B737_800_SPEC);
    const cosA = Math.cos(6 * deg);
    expect(a.dragBodyX / a.drag).toBeCloseTo(-cosA, 9);
    expect(a.dragBodyY).toBeCloseTo(0, 12);
  });

  it('resolves lift perpendicular to the air-relative velocity in the body x-z plane', () => {
    const s = airborneAt(8, 90);
    const a = computeAero(s, zeroControls, B737_800_SPEC);
    const sinA = Math.sin(8 * deg);
    const cosA = Math.cos(8 * deg);
    expect(a.liftBodyX / a.lift).toBeCloseTo(sinA, 9);
    expect(a.liftBodyZ / a.lift).toBeCloseTo(-cosA, 9);
    expect(a.dragBodyX / a.drag).toBeCloseTo(-cosA, 9);
    const alongWind = a.liftBodyX * cosA + a.liftBodyZ * sinA;
    expect(Math.abs(alongWind) / a.lift).toBeLessThan(1e-9);
    const perpWind = a.liftBodyX * sinA - a.liftBodyZ * cosA;
    expect(perpWind / a.lift).toBeCloseTo(1, 9);
  });

  it('keeps sideslip drag along the full air-relative direction', () => {
    const s = airborneAt(4, 90);
    s.velocity.v = 9;
    const a = computeAero(s, zeroControls, B737_800_SPEC);
    const tas = Math.hypot(s.velocity.u, s.velocity.v, s.velocity.w);
    expect(a.dragBodyX / a.drag).toBeCloseTo(-s.velocity.u / tas, 9);
    expect(a.dragBodyY / a.drag).toBeCloseTo(-s.velocity.v / tas, 9);
  });

  it('applies the resolved drag and lift components in the velocity update', () => {
    const s = airborneAt(2, 130);
    const a = computeAero(s, zeroControls, B737_800_SPEC);
    const before = structuredClone(s);
    integrate(s, zeroControls, B737_800_SPEC, 1 / 480);
    const expectedUDot = (a.dragBodyX + a.liftBodyX) / before.grossWeight - G * Math.sin(before.attitude.theta);
    const expectedWDot = (a.dragBodyZ + a.liftBodyZ) / before.grossWeight + G * Math.cos(before.attitude.theta);
    expect((s.velocity.u - before.velocity.u) * 480).toBeCloseTo(expectedUDot, 2);
    expect((s.velocity.w - before.velocity.w) * 480).toBeCloseTo(expectedWDot, 2);
  });

  it('balances thrust against the wind-axis drag component at fixed AoA', () => {
    const s = airborneAt(4, 120);
    const a = computeAero(s, zeroControls, B737_800_SPEC);
    const cosA = Math.cos(4 * deg);
    const sinA = Math.sin(4 * deg);
    for (const engine of s.engines) engine.thrust = (a.drag * cosA - a.lift * sinA) / 2;
    const rebalanced = computeAero(s, zeroControls, B737_800_SPEC);
    const axial = rebalanced.thrust + rebalanced.dragBodyX + rebalanced.liftBodyX;
    expect(Math.abs(axial) / rebalanced.drag).toBeLessThan(1e-9);
  });
});
