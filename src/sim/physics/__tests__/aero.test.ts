import { describe, it, expect } from 'vitest';
import { computeAero, computeGroundEffectFactors } from '../aero';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';
import type { WindInfo } from '../../weather';
import { B737_AERO } from '../../systems/AeroModel';

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

function takeoffPitchState(options: { cg: number; trimUnits: number; aoaDeg?: number; speedMs?: number }) {
  const s = stateAtAoA(options.aoaDeg ?? 5, options.speedMs ?? 75);
  s.cg = options.cg;
  s.config.flapSetting = 5;
  s.config.gearDown = false;
  s.config.stabilizerTrimUnits = options.trimUnits;
  return s;
}

function pitchMomentAt(options: { cg: number; trimUnits: number; elevator: number; aoaDeg?: number; speedMs?: number }): number {
  return computeAero(
    takeoffPitchState(options),
    { ...cruise, elevator: options.elevator, throttle1: 0, throttle2: 0, flapLever: 5, gearLever: 'UP' },
    B737_800_SPEC,
  ).pitchMoment;
}

function elevatorForNeutralPitchMoment(options: { cg: number; trimUnits: number; aoaDeg?: number; speedMs?: number }): number {
  let low = -1;
  let high = 1;
  for (let i = 0; i < 30; i += 1) {
    const elevator = (low + high) / 2;
    const pitchMoment = pitchMomentAt({ ...options, elevator });
    if (pitchMoment > 0) low = elevator;
    else high = elevator;
  }
  return (low + high) / 2;
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

  it('uses side-force coefficients supplied by the active aero model', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 80;

    const baseline = computeAero(s, { ...cruise, rudder: 0.5, throttle1: 0, throttle2: 0 }, B737_800_SPEC, B737_AERO);
    const customAero = {
      ...B737_AERO,
      sideForce: {
        ...B737_AERO.sideForce,
        cyRudder: B737_AERO.sideForce.cyRudder * 2,
      },
    };
    const custom = computeAero(s, { ...cruise, rudder: 0.5, throttle1: 0, throttle2: 0 }, B737_800_SPEC, customAero);

    expect(custom.side).toBeCloseTo(baseline.side * 2, 6);
  });

  it('applies ground-effect factors only close to the runway', () => {
    const near = computeGroundEffectFactors(B737_800_SPEC.wingSpan * 0.12, B737_800_SPEC.wingSpan);
    const far = computeGroundEffectFactors(B737_800_SPEC.wingSpan * 1.2, B737_800_SPEC.wingSpan);

    expect(near.liftMultiplier).toBeGreaterThan(1);
    expect(near.inducedDragMultiplier).toBeLessThan(1);
    expect(far.liftMultiplier).toBe(1);
    expect(far.inducedDragMultiplier).toBe(1);
  });

  it('slightly increases lift and reduces induced drag near the runway at the same altitude', () => {
    const near = stateAtAoA(8, 75);
    near.position.alt = 5000;
    near.config.flapSetting = 5;
    near.config.gearDown = true;
    near.ground = {
      ...near.ground,
      aglFt: 15,
      groundAltFt: near.position.alt - 15,
      weightOnWheels: false,
      onRunway: false,
      contact: 'none',
    };

    const far = stateAtAoA(8, 75);
    far.position.alt = near.position.alt;
    far.config.flapSetting = near.config.flapSetting;
    far.config.gearDown = near.config.gearDown;
    far.ground = {
      ...far.ground,
      aglFt: 1000,
      groundAltFt: far.position.alt - 1000,
      weightOnWheels: false,
      onRunway: false,
      contact: 'none',
    };

    const nearAero = computeAero(near, { ...cruise, throttle1: 0, throttle2: 0, flapLever: 5, gearLever: 'DOWN' }, B737_800_SPEC);
    const farAero = computeAero(far, { ...cruise, throttle1: 0, throttle2: 0, flapLever: 5, gearLever: 'DOWN' }, B737_800_SPEC);

    expect(nearAero.lift).toBeGreaterThan(farAero.lift * 1.005);
    expect(nearAero.drag).toBeLessThan(farAero.drag * 0.98);
  });

  it('reduces lift in hot low-pressure scenario weather at the same aircraft state', () => {
    const s = stateAtAoA(6, 85);
    s.position.alt = 432;
    s.ground = { ...s.ground, groundAltFt: 432, aglFt: 0 };
    const computeAeroWithWeather = computeAero as typeof computeAero & ((
      state: Parameters<typeof computeAero>[0],
      inputs: Parameters<typeof computeAero>[1],
      spec: Parameters<typeof computeAero>[2],
      aeroModel: Parameters<typeof computeAero>[3],
      wind: Parameters<typeof computeAero>[4],
      weather: { qnhHpa: number; surfaceTemperatureC: number },
    ) => ReturnType<typeof computeAero>);

    const standardDay = computeAeroWithWeather(
      s,
      { ...cruise, throttle1: 0, throttle2: 0 },
      B737_800_SPEC,
      B737_AERO,
      null,
      { qnhHpa: 1013.25, surfaceTemperatureC: 15 },
    );
    const hotLowPressure = computeAeroWithWeather(
      s,
      { ...cruise, throttle1: 0, throttle2: 0 },
      B737_800_SPEC,
      B737_AERO,
      null,
      { qnhHpa: 990, surfaceTemperatureC: 35 },
    );

    expect(hotLowPressure.lift).toBeLessThan(standardDay.lift * 0.94);
    expect(hotLowPressure.drag).toBeLessThan(standardDay.drag * 0.94);
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

  it('landing spoilers dump lift while adding drag from FDM coefficients', () => {
    const stowedState = stateAtAoA(7, 72);
    stowedState.config.flapSetting = 30;
    stowedState.config.gearDown = true;
    const deployedState = structuredClone(stowedState);
    deployedState.config.speedBrake = 1;

    const stowed = computeAero(
      stowedState,
      { ...cruise, flapLever: 30, gearLever: 'DOWN', spoilers: 0, throttle1: 0, throttle2: 0 },
      B737_800_SPEC,
    );
    const deployed = computeAero(
      deployedState,
      { ...cruise, flapLever: 30, gearLever: 'DOWN', spoilers: 1, throttle1: 0, throttle2: 0 },
      B737_800_SPEC,
    );

    expect(deployed.lift).toBeLessThan(stowed.lift * 0.75);
    expect(deployed.drag).toBeGreaterThan(stowed.drag);
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

  it('nose-up stabilizer trim reduces the elevator needed for neutral pitch moment', () => {
    const noTrimElevator = elevatorForNeutralPitchMoment({ cg: 25, trimUnits: 0 });
    const takeoffTrimElevator = elevatorForNeutralPitchMoment({ cg: 25, trimUnits: 5 });

    expect(takeoffTrimElevator).toBeGreaterThan(noTrimElevator + 0.08);
  });

  it('forward CG requires more nose-up elevator than aft CG at the same takeoff trim', () => {
    const forwardCgElevator = elevatorForNeutralPitchMoment({ cg: 15, trimUnits: 5 });
    const aftCgElevator = elevatorForNeutralPitchMoment({ cg: 29, trimUnits: 5 });

    expect(forwardCgElevator).toBeLessThan(aftCgElevator - 0.2);
    expect(forwardCgElevator).toBeLessThan(0);
  });

  it('aft CG reduces static pitch stability so AoA changes are less self-damping', () => {
    const forwardLowAoA = pitchMomentAt({ cg: 15, trimUnits: 5, elevator: 0, aoaDeg: 4 });
    const forwardHighAoA = pitchMomentAt({ cg: 15, trimUnits: 5, elevator: 0, aoaDeg: 8 });
    const aftLowAoA = pitchMomentAt({ cg: 29, trimUnits: 5, elevator: 0, aoaDeg: 4 });
    const aftHighAoA = pitchMomentAt({ cg: 29, trimUnits: 5, elevator: 0, aoaDeg: 8 });
    const forwardSlope = forwardHighAoA - forwardLowAoA;
    const aftSlope = aftHighAoA - aftLowAoA;

    expect(forwardSlope).toBeLessThan(0);
    expect(aftSlope).toBeLessThan(0);
    expect(aftSlope).toBeGreaterThan(forwardSlope + 50_000);
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
