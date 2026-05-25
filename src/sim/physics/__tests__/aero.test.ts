import { describe, it, expect } from 'vitest';
import { computeAero } from '../aero';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';

const cruise: ControlInputs = {
  elevator: -0.1, aileron: 0, rudder: 0,
  throttle1: 0.8, throttle2: 0.8,
  flapLever: 0, gearLever: 'UP', spoilers: 0, brake: 0,
};

describe('computeAero', () => {
  it('at rest, thrust and lift near zero', () => {
    const s = createInitialState(B737_800_SPEC);
    const z: ControlInputs = { ...cruise, throttle1: 0, throttle2: 0 };
    const a = computeAero(s, z, B737_800_SPEC);
    expect(a.thrust).toBeLessThan(100);
    expect(a.lift).toBeLessThan(100);
  });

  it('at cruise, lift ≈ weight', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6; // ~250 kt
    s.position.alt = 35000;
    s.engines[0].n1 = 90; s.engines[1].n1 = 90;
    s.engines[0].running = s.engines[1].running = true;
    const a = computeAero(s, cruise, B737_800_SPEC);
    const weightN = s.grossWeight * 9.80665;
    expect(a.lift).toBeGreaterThan(weightN * 0.4);
    expect(a.lift).toBeLessThan(weightN * 2.5);
    expect(a.drag).toBeGreaterThan(0);
    expect(a.thrust).toBeGreaterThan(10000);
  });

  it('flaps increase lift and drag', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 70; // ~136 kt
    const clean = computeAero(s, { ...cruise, throttle1: 0, throttle2: 0 }, B737_800_SPEC);
    s.config.flapSetting = 15;
    const flap = computeAero(s, { ...cruise, throttle1: 0, throttle2: 0 }, B737_800_SPEC);
    expect(flap.lift).toBeGreaterThan(clean.lift);
    expect(flap.drag).toBeGreaterThan(clean.drag);
  });
});
