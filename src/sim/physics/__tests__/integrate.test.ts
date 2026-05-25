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

  it('preserves initial heading after first quaternion-derived tick', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.attitude.psi).toBeCloseTo(Math.PI);

    integrate(s, idle, B737_800_SPEC, 1 / 60);

    expect(s.attitude.psi).toBeCloseTo(Math.PI, 6);
  });

  it('accelerates downward in freefall at level attitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 10000;
    s.velocity.u = 0;
    s.velocity.v = 0;
    s.velocity.w = 0;
    s.config.gearDown = false;

    integrate(s, idle, B737_800_SPEC, 0.1);

    expect(s.velocity.w).toBeGreaterThan(0); // body/NED down is positive
  });

  it('TOGA accelerates and pitches up', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 30;
    const toga: ControlInputs = { ...idle, throttle1: 1, throttle2: 1, elevator: -1, gearLever: 'UP' };
    for (let i = 0; i < 60; i++) integrate(s, toga, B737_800_SPEC, 1/60);
    expect(s.velocity.u).toBeGreaterThan(30);
    expect(s.attitude.theta).toBeGreaterThan(0);
  });

  it('roll input produces negative roll rate', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    const bank: ControlInputs = { ...idle, throttle1: 0.6, throttle2: 0.6, aileron: -1 };
    for (let i = 0; i < 30; i++) integrate(s, bank, B737_800_SPEC, 1/60);
    expect(s.angularVel.p).toBeLessThan(0);
  });
});
