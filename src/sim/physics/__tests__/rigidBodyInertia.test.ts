import { expect, it } from 'vitest';
import { B737_800_SPEC, createInitialState, type ControlInputs } from '../../types';
import { computeAero } from '../aero';
import { integrate } from '../integrate';
import { updateFuel } from '../../systems/fuel';

const idle: ControlInputs = { elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0, gearLever: 'UP', flapLever: 0, spoilers: 0, brake: 0 };
function airborne() {
  const s = createInitialState(B737_800_SPEC); s.position.alt = 10_000;
  s.config.gearDown = false; s.config.gearPosition = 0; s.config.flapSetting = 0;
  s.ground.weightOnWheels = false; s.ground.contact = 'none'; s.flightPhase = 'CRUISE';
  return s;
}

it.each([40_000, -40_000])('satisfies the full inertia tensor at nonzero product of inertia %s', (ixz) => {
  const s = airborne(); s.angularVel = { p: 0.15, q: 0.2, r: -0.3 };
  const spec = { ...B737_800_SPEC, ixz }; const before = structuredClone(s); const dt = 1e-7;
  integrate(s, idle, spec, dt);
  const { p, q, r } = before.angularVel;
  const h = [spec.ixx * p - ixz * r, spec.iyy * q, spec.izz * r - ixz * p];
  const d = [(s.angularVel.p - p) / dt, (s.angularVel.q - q) / dt, (s.angularVel.r - r) / dt];
  const tensorResidual = [spec.ixx * d[0] - ixz * d[2] + q * h[2] - r * h[1],
    spec.iyy * d[1] + r * h[0] - p * h[2], -ixz * d[0] + spec.izz * d[2] + p * h[1] - q * h[0]];
  tensorResidual.forEach((torque) => expect(Math.abs(torque)).toBeLessThan(0.02));
});

it('satisfies the full tensor with independently sampled nonzero aerodynamic moments', () => {
  const s = airborne(); s.angularVel = { p: 0.15, q: -0.2, r: 0.3 }; s.velocity = { u: 100, v: 8, w: 6 };
  const controls = { ...idle, aileron: -0.3, rudder: 0.2, elevator: 0.1 };
  // Runtime refreshes mass/CG before the moment solve; sample that same physical condition.
  updateFuel(s, B737_800_SPEC, 0);
  const before = structuredClone(s); const aero = computeAero(before, controls, B737_800_SPEC); const dt = 1e-7;
  integrate(s, controls, B737_800_SPEC, dt);
  const { p, q, r } = before.angularVel; const { ixx, iyy, izz, ixz } = B737_800_SPEC;
  const h = [ixx * p - ixz * r, iyy * q, izz * r - ixz * p];
  const d = [(s.angularVel.p - p) / dt, (s.angularVel.q - q) / dt, (s.angularVel.r - r) / dt];
  const residual = [ixx * d[0] - ixz * d[2] + q * h[2] - r * h[1] - aero.rollMoment,
    iyy * d[1] + r * h[0] - p * h[2] - aero.pitchMoment, -ixz * d[0] + izz * d[2] + p * h[1] - q * h[0] - aero.yawMoment];
  residual.forEach((torque) => expect(Math.abs(torque)).toBeLessThan(0.02));
});

it('bounds torque-free energy drift, preserves quaternion norm and converges under timestep refinement', () => {
  // Synthetic rigid body: zero wing area removes aerodynamic forces and moments.
  const spec = { ...B737_800_SPEC, wingArea: 0 };
  const seed = airborne(); seed.angularVel = { p: 0.15, q: -0.2, r: 0.3 };
  const energy = (s: typeof seed) => {
    const { p, q, r } = s.angularVel;
    return 0.5 * (spec.ixx * p * p + spec.iyy * q * q + spec.izz * r * r - 2 * spec.ixz * p * r);
  };
  const run = (hz: number) => {
    const s = structuredClone(seed);
    for (let n = 0; n < hz * 3; n++) integrate(s, idle, spec, 1 / hz);
    const values = Object.values(s.quaternion);
    expect(Math.hypot(...values)).toBeCloseTo(1, 12);
    expect(Math.abs(energy(s) / energy(seed) - 1)).toBeLessThan(0.005);
    return [...Object.values(s.angularVel), ...values];
  };
  const reference = run(1920);
  const error = (hz: number) => Math.hypot(...run(hz).map((value, n) => value - reference[n]));
  const coarse = error(60), medium = error(120), fine = error(240);
  expect(medium).toBeLessThan(coarse * 0.6); expect(fine).toBeLessThan(medium * 0.6);
});
