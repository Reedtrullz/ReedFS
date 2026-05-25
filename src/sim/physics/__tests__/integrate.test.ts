import { describe, it, expect } from 'vitest';
import { integrate } from '../integrate';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { Attitude, ControlInputs } from '../../types';
import type { WindInfo } from '../../weather';
import { eulerToQuat } from '../quaternion';
import { KSEA_RUNWAY_ALT_FT } from '../../systems/ground';

const idle: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 0,
};

function setAttitude(s: ReturnType<typeof createInitialState>, attitude: Attitude): void {
  s.attitude = attitude;
  s.quaternion = eulerToQuat(attitude.phi, attitude.theta, attitude.psi);
}

describe('integrate', () => {
  it('at rest keeps horizontal velocity initially', () => {
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

  it('projects nose-up gravity backward in body axes', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 10000;
    s.config.gearDown = false;
    setAttitude(s, { phi: 0, theta: Math.PI / 6, psi: Math.PI });

    integrate(s, idle, B737_800_SPEC, 0.1);

    expect(s.velocity.u).toBeLessThan(-0.4);
    expect(s.velocity.w).toBeGreaterThan(0.8);
  });

  it('projects right-wing-down gravity to positive body-y', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 10000;
    s.config.gearDown = false;
    setAttitude(s, { phi: Math.PI / 6, theta: 0, psi: Math.PI });

    integrate(s, idle, B737_800_SPEC, 0.1);

    expect(s.velocity.v).toBeGreaterThan(0.4);
    expect(s.velocity.w).toBeGreaterThan(0.8);
  });

  it('tailwind reverse relative flow accelerates forward instead of backward', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 10000;
    s.config.gearDown = false;
    const tailwind: WindInfo = { dir: 0, speed: 20 }; // initial heading south; wind from north is a tailwind

    integrate(s, idle, B737_800_SPEC, 0.1, null, null, tailwind);

    expect(s.velocity.u).toBeGreaterThan(0);
  });

  it('keeps a stopped gear-down aircraft on the runway instead of sinking below terrain', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = KSEA_RUNWAY_ALT_FT;
    s.velocity.u = 0;
    s.velocity.v = 0;
    s.velocity.w = 0;
    s.config.gearDown = true;

    for (let i = 0; i < 120; i++) {
      integrate(s, idle, B737_800_SPEC, 1 / 60);
    }

    expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(s.velocity.w).toBeGreaterThanOrEqual(0);
    expect(s.velocity.w).toBeLessThan(0.1);
  });

  it('keeps full-throttle takeoff roll on the runway before rotation speed', () => {
    const s = createInitialState(B737_800_SPEC);
    const takeoffRoll: ControlInputs = {
      ...idle,
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
    };

    for (let i = 0; i < 5 * 60; i++) {
      integrate(s, takeoffRoll, B737_800_SPEC, 1 / 60);
    }

    expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(s.velocity.u).toBeGreaterThan(5);
    expect(s.config.gearDown).toBe(true);
  });

  it('brake input decelerates the aircraft during ground roll', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = KSEA_RUNWAY_ALT_FT;
    s.velocity.u = 35;
    s.config.gearDown = true;
    const braking: ControlInputs = { ...idle, brake: 1, gearLever: 'DOWN' };

    integrate(s, braking, B737_800_SPEC, 1);

    expect(s.velocity.u).toBeGreaterThanOrEqual(0);
    expect(s.velocity.u).toBeLessThan(35);
  });

  it('ignores gear-up command while weight-on-wheels but allows it after liftoff', () => {
    const onRunway = createInitialState(B737_800_SPEC);
    onRunway.position.alt = KSEA_RUNWAY_ALT_FT;
    onRunway.config.gearDown = true;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    integrate(onRunway, gearUp, B737_800_SPEC, 1 / 60);

    expect(onRunway.config.gearDown).toBe(true);

    const airborne = createInitialState(B737_800_SPEC);
    airborne.position.alt = KSEA_RUNWAY_ALT_FT + 1000;
    airborne.config.gearDown = true;

    integrate(airborne, gearUp, B737_800_SPEC, 1 / 60);

    expect(airborne.config.gearDown).toBe(false);
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
    s.position.alt = KSEA_RUNWAY_ALT_FT + 1000;
    s.config.gearDown = false;
    s.velocity.u = 128.6;
    const bank: ControlInputs = { ...idle, throttle1: 0.6, throttle2: 0.6, aileron: -1, gearLever: 'UP' };
    for (let i = 0; i < 30; i++) integrate(s, bank, B737_800_SPEC, 1/60);
    expect(s.angularVel.p).toBeLessThan(0);
  });
});
