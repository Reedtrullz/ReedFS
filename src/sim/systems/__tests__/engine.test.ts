import { describe, it, expect } from 'vitest';
import { computeEngineThrustN, updateEngines } from '../engine';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';
import { eulerToQuat } from '../../physics/quaternion';

const idle: ControlInputs = { elevator:0,aileron:0,rudder:0,throttle1:0,throttle2:0,flapLever:0,gearLever:'DOWN',spoilers:0,brake:0 };

describe('updateEngines', () => {
  it('N1 spools toward TOGA when commanded', () => {
    const s = createInitialState(B737_800_SPEC);
    updateEngines(s, { ...idle, throttle1: 1, throttle2: 1 }, B737_800_SPEC, 1);
    expect(s.engines[0].n1).toBeGreaterThan(0);
    expect(s.engines[0].n1).toBeLessThan(100);
  });

  it('N2 spools faster than N1', () => {
    const s = createInitialState(B737_800_SPEC);
    updateEngines(s, { ...idle, throttle1: 1, throttle2: 1 }, B737_800_SPEC, 3);
    expect(s.engines[0].n2).toBeGreaterThan(s.engines[0].n1);
  });

  it('fuelFlow increases with N1', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[0].n1 = 90; s.engines[0].running = true;
    updateEngines(s, { ...idle, throttle1: 0.9, throttle2: 0.9 }, B737_800_SPEC, 0);
    expect(s.engines[0].fuelFlow).toBeGreaterThan(100);
  });

  it('thrust lapses with altitude and high Mach instead of using positive ram boost', () => {
    const seaLevel = computeEngineThrustN(90, B737_800_SPEC, 0, 0.2);
    const highAltitude = computeEngineThrustN(90, B737_800_SPEC, 35_000, 0.2);
    const highMach = computeEngineThrustN(90, B737_800_SPEC, 0, 0.82);

    expect(highAltitude).toBeLessThan(seaLevel * 0.65);
    expect(highMach).toBeLessThan(seaLevel);
    expect(highMach).toBeGreaterThan(seaLevel * 0.5);
  });

  it('stores lagged per-engine thrust in newtons from the shared thrust model', () => {
    const s = createInitialState(B737_800_SPEC);
    updateEngines(s, { ...idle, throttle1: 1, throttle2: 1 }, B737_800_SPEC, 1);

    const expected = computeEngineThrustN(s.engines[0].n1, B737_800_SPEC, s.position.alt, 0);
    expect(s.engines[0].thrust).toBeGreaterThan(0);
    expect(s.engines[0].thrust).toBeLessThan(computeEngineThrustN(100, B737_800_SPEC, s.position.alt, 0));
    expect(s.engines[0].thrust).toBeCloseTo(expected, 6);
  });

  it('computes Mach lapse from air-relative speed instead of ground-relative speed', () => {
    const headwind = createInitialState(B737_800_SPEC);
    const tailwind = createInitialState(B737_800_SPEC);
    for (const state of [headwind, tailwind]) {
      state.attitude = { ...state.attitude, psi: 0 };
      state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
      state.position.alt = 10_000;
      state.velocity.u = 155;
      state.velocity.v = 0;
      state.velocity.w = 0;
      state.engines[0].n1 = 90;
      state.engines[1].n1 = 90;
    }

    updateEngines(headwind, { ...idle, throttle1: 0.9, throttle2: 0.9 }, B737_800_SPEC, 0, { dir: 0, speed: 80 });
    updateEngines(tailwind, { ...idle, throttle1: 0.9, throttle2: 0.9 }, B737_800_SPEC, 0, { dir: 180, speed: 80 });

    expect(headwind.engines[0].thrust).toBeLessThan(tailwind.engines[0].thrust);
  });

  it('N1 spools down slower than up', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[0].n1 = 90; s.engines[0].running = true;
    // Command to idle, 1 second
    updateEngines(s, idle, B737_800_SPEC, 1);
    // Should still be fairly high (slow spool-down)
    expect(s.engines[0].n1).toBeGreaterThan(40);
  });
});
