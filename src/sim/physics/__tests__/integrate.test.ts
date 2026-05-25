import { describe, it, expect } from 'vitest';
import { integrate } from '../integrate';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';

const idle: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 0,
};

describe('integrate', () => {
  it('at rest, nothing changes', () => {
    const s = createInitialState(B737_800_SPEC);
    const altBefore = s.position.alt;
    integrate(s, idle, B737_800_SPEC, 1 / 60);
    expect(s.position.alt).toBeCloseTo(altBefore, 0);
    expect(s.velocity.u).toBe(0);
  });

  it('TOGA accelerates and climbs', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 30;
    const toga: ControlInputs = { ...idle, throttle1: 1, throttle2: 1, elevator: -0.3, gearLever: 'UP' };
    for (let i = 0; i < 60; i++) integrate(s, toga, B737_800_SPEC, 1/60);
    expect(s.velocity.u).toBeGreaterThan(30);
    expect(s.position.alt).toBeGreaterThan(440);
  });

  it('roll input produces negative roll rate', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    const bank: ControlInputs = { ...idle, throttle1: 0.6, throttle2: 0.6, aileron: -1 };
    for (let i = 0; i < 30; i++) integrate(s, bank, B737_800_SPEC, 1/60);
    expect(s.angularVel.p).toBeLessThan(0);
  });
});
