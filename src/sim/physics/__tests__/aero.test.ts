import { describe, it, expect } from 'vitest';
import { computeAero } from '../aero';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';
import type { WindInfo } from '../../weather';

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

  it('orders elevator pitch moments by nose-up command in takeoff configuration', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 70; // rotation-speed order of magnitude
    s.config.flapSetting = 5;

    const noseUp = computeAero(s, { ...cruise, elevator: -0.3, throttle1: 0, throttle2: 0 }, B737_800_SPEC);
    const neutral = computeAero(s, { ...cruise, elevator: 0, throttle1: 0, throttle2: 0 }, B737_800_SPEC);
    const noseDown = computeAero(s, { ...cruise, elevator: 0.3, throttle1: 0, throttle2: 0 }, B737_800_SPEC);

    expect(noseUp.pitchMoment).toBeGreaterThan(neutral.pitchMoment);
    expect(noseDown.pitchMoment).toBeLessThan(neutral.pitchMoment);
  });

  it('full nose-up elevator produces positive pitch moment in takeoff configuration', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 70;
    s.config.flapSetting = 5;

    const a = computeAero(s, { ...cruise, elevator: -1, throttle1: 0, throttle2: 0 }, B737_800_SPEC);

    expect(a.pitchMoment).toBeGreaterThan(0);
  });

  it('orients drag opposite the signed air-relative longitudinal velocity', () => {
    const s = createInitialState(B737_800_SPEC); // initial heading south
    const headwind: WindInfo = { dir: 180, speed: 20 };
    const tailwind: WindInfo = { dir: 0, speed: 20 };

    const headwindAero = computeAero(s, { ...cruise, throttle1: 0, throttle2: 0 }, B737_800_SPEC, undefined, headwind);
    const tailwindAero = computeAero(s, { ...cruise, throttle1: 0, throttle2: 0 }, B737_800_SPEC, undefined, tailwind);

    expect(headwindAero.drag).toBeGreaterThan(0);
    expect(headwindAero.dragBodyX).toBeLessThan(0);
    expect(tailwindAero.drag).toBeGreaterThan(0);
    expect(tailwindAero.dragBodyX).toBeGreaterThan(0);
  });
});
