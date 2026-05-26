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

function stateAtAoA(aoaDeg: number, speedMs = 90) {
  const s = createInitialState(B737_800_SPEC);
  const aoaRad = aoaDeg * Math.PI / 180;
  s.velocity.u = speedMs * Math.cos(aoaRad);
  s.velocity.w = speedMs * Math.sin(aoaRad);
  return s;
}

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
    s.velocity.w = Math.tan(4 * Math.PI / 180) * s.velocity.u; // representative cruise AoA
    s.position.alt = 35000;
    s.engines[0].n1 = 90; s.engines[1].n1 = 90;
    s.engines[0].thrust = 45_000; s.engines[1].thrust = 45_000;
    s.engines[0].running = s.engines[1].running = true;
    const a = computeAero(s, cruise, B737_800_SPEC);
    const weightN = s.grossWeight * 9.80665;
    expect(a.lift).toBeGreaterThan(weightN * 0.4);
    expect(a.lift).toBeLessThan(weightN * 2.5);
    expect(a.drag).toBeGreaterThan(0);
    expect(a.thrust).toBeGreaterThan(10000);
  });

  it('uses engine-system thrust as the single thrust source', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100;
    s.engines[0].n1 = 0;
    s.engines[1].n1 = 0;
    s.engines[0].thrust = 12_345;
    s.engines[1].thrust = 23_456;

    const a = computeAero(s, { ...cruise, throttle1: 1, throttle2: 1 }, B737_800_SPEC);

    expect(a.thrust).toBeCloseTo(35_801, 6);
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

  it('clean lift rises in the linear range but saturates near stall', () => {
    const low = computeAero(stateAtAoA(2), { ...cruise, throttle1: 0, throttle2: 0 }, B737_800_SPEC);
    const mid = computeAero(stateAtAoA(8), { ...cruise, throttle1: 0, throttle2: 0 }, B737_800_SPEC);
    const nearStall = computeAero(stateAtAoA(14), { ...cruise, throttle1: 0, throttle2: 0 }, B737_800_SPEC);
    const postStall = computeAero(stateAtAoA(24), { ...cruise, throttle1: 0, throttle2: 0 }, B737_800_SPEC);

    expect(mid.lift).toBeGreaterThan(low.lift);
    expect(nearStall.lift).toBeGreaterThan(mid.lift);
    expect(postStall.lift).toBeLessThan(nearStall.lift * 1.05);
    expect(postStall.drag).toBeGreaterThan(nearStall.drag * 1.5);
  });

  it('drag increases across flap detents and with landing gear', () => {
    const base = stateAtAoA(5, 75);
    base.config.gearDown = false;
    const clean = computeAero(base, { ...cruise, throttle1: 0, throttle2: 0, gearLever: 'UP' }, B737_800_SPEC);

    const flaps5State = stateAtAoA(5, 75);
    flaps5State.config.flapSetting = 5;
    flaps5State.config.gearDown = false;
    const flaps5 = computeAero(flaps5State, { ...cruise, throttle1: 0, throttle2: 0, flapLever: 5, gearLever: 'UP' }, B737_800_SPEC);

    const flaps30State = stateAtAoA(5, 75);
    flaps30State.config.flapSetting = 30;
    flaps30State.config.gearDown = false;
    const flaps30 = computeAero(flaps30State, { ...cruise, throttle1: 0, throttle2: 0, flapLever: 30, gearLever: 'UP' }, B737_800_SPEC);

    flaps30State.config.gearDown = true;
    const dirtyGear = computeAero(flaps30State, { ...cruise, throttle1: 0, throttle2: 0, flapLever: 30, gearLever: 'DOWN' }, B737_800_SPEC);

    expect(flaps5.drag).toBeGreaterThan(clean.drag);
    expect(flaps30.drag).toBeGreaterThan(flaps5.drag);
    expect(dirtyGear.drag).toBeGreaterThan(flaps30.drag * 1.2);
  });

  it('gear-down flaps-5 climb has materially worse lift-to-drag than clean climb', () => {
    const cleanState = stateAtAoA(5, 90);
    cleanState.config.gearDown = false;
    const clean = computeAero(cleanState, { ...cruise, throttle1: 0, throttle2: 0, gearLever: 'UP' }, B737_800_SPEC);

    const dirtyState = stateAtAoA(5, 90);
    dirtyState.config.flapSetting = 5;
    dirtyState.config.gearDown = true;
    const dirty = computeAero(dirtyState, { ...cruise, throttle1: 0, throttle2: 0, flapLever: 5, gearLever: 'DOWN' }, B737_800_SPEC);

    expect(dirty.lift / dirty.drag).toBeLessThan((clean.lift / clean.drag) * 0.8);
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
