import { describe, it, expect } from 'vitest';
import { integrate } from '../integrate';
import { createInitialState, B737_800_SPEC, createB737GearStations } from '../../types';
import type { Attitude, ControlInputs } from '../../types';
import type { WindInfo } from '../../weather';
import { eulerToQuat } from '../quaternion';
import { computeDerived } from '../derived';
import { ktToMs } from '../units';
import { GROUND_CONTACT_EPSILON_FT, KSEA_RUNWAY_ALT_FT } from '../../systems/ground';
import { computeHeldKeyInputs } from '../../../input/keyboardControls';
import { runFixedStepScenario, takeoffRollInputs } from '../../__tests__/scenarioHelpers';
import { createAircraftStateForScenario, KSEA_TUTORIAL_SCENARIO } from '../../scenarios';

const idle: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 0,
};

function setAttitude(s: ReturnType<typeof createInitialState>, attitude: Attitude): void {
  s.attitude = attitude;
  s.quaternion = eulerToQuat(attitude.phi, attitude.theta, attitude.psi);
}

function airborneTakeoffConfigState(trimUnits: number): ReturnType<typeof createInitialState> {
  const state = createInitialState(B737_800_SPEC);
  const aoaRad = 5 * Math.PI / 180;
  const speedMs = 75;
  state.position.alt = KSEA_RUNWAY_ALT_FT + 1000;
  state.ground = {
    ...state.ground,
    aglFt: 1000,
    weightOnWheels: false,
    normalForceN: 0,
    onRunway: false,
    contact: 'none',
  };
  state.velocity.u = speedMs * Math.cos(aoaRad);
  state.velocity.w = speedMs * Math.sin(aoaRad);
  state.config.flapSetting = 5;
  state.config.gearDown = false;
  state.config.stabilizerTrimUnits = trimUnits;
  state.cg = 25;
  state.flightPhase = 'CLIMB';
  return state;
}

function runGearDownRotationAfterTakeoffRoll(): ReturnType<typeof createInitialState> {
  const state = runFixedStepScenario({ seconds: 35, hz: 120, inputs: takeoffRollInputs() });
  state.flightPhase = 'TAKEOFF';

  return runFixedStepScenario({
    state,
    seconds: 10,
    hz: 120,
    inputs: takeoffRollInputs({ elevator: -1, gearLever: 'DOWN' }),
  });
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

  it('tutorial takeoff scenario starts with a takeoff-range stabilizer trim setting', () => {
    const state = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);

    expect(state.config.flapSetting).toBe(5);
    expect(state.config.stabilizerTrimUnits).toBeGreaterThanOrEqual(4);
    expect(state.config.stabilizerTrimUnits).toBeLessThanOrEqual(6);
  });

  it('takeoff trim creates a stronger hands-off nose-up pitch tendency than zero trim', () => {
    const untrimmed = airborneTakeoffConfigState(0);
    const trimmed = airborneTakeoffConfigState(KSEA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    const handsOff: ControlInputs = { ...idle, throttle1: 0.7, throttle2: 0.7, flapLever: 5, gearLever: 'UP' };

    for (let i = 0; i < 60; i += 1) {
      integrate(untrimmed, handsOff, B737_800_SPEC, 1 / 60);
      integrate(trimmed, handsOff, B737_800_SPEC, 1 / 60);
    }

    expect(trimmed.angularVel.q).toBeGreaterThan(untrimmed.angularVel.q + 0.005);
    expect(trimmed.attitude.theta).toBeGreaterThan(untrimmed.attitude.theta);
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
    const takeoffRoll = takeoffRollInputs();

    for (let i = 0; i < 5 * 60; i++) {
      integrate(s, takeoffRoll, B737_800_SPEC, 1 / 60);
    }

    expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(s.velocity.u).toBeGreaterThan(5);
    expect(s.config.gearDown).toBe(true);
  });

  it('full-throttle takeoff roll accelerates at 120 Hz', () => {
    const s = runFixedStepScenario({ hz: 120, seconds: 20 });

    expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(s.velocity.u).toBeGreaterThan(25);
    expect(s.config.gearDown).toBe(true);
  });

  it('full-throttle takeoff roll accelerates at 144 Hz', () => {
    const s = runFixedStepScenario({ hz: 144, seconds: 20 });

    expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(s.velocity.u).toBeGreaterThan(25);
    expect(s.config.gearDown).toBe(true);
  });

  it('does not create large positive vertical speed while weight-on-wheels from pitch alone', () => {
    const state = createInitialState(B737_800_SPEC);
    state.flightPhase = 'TAKEOFF';
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 90;
    state.velocity.w = 0;
    state.config.gearDown = true;
    setAttitude(state, { ...state.attitude, theta: 10 * Math.PI / 180 });

    integrate(state, takeoffRollInputs({ elevator: -1 }), B737_800_SPEC, 1 / 120);

    const derived = computeDerived(state);
    expect(state.position.alt).toBeLessThanOrEqual(KSEA_RUNWAY_ALT_FT + GROUND_CONTACT_EPSILON_FT);
    expect(Math.abs(derived.vs)).toBeLessThan(300);
  });

  it('does not skip runway contact at 60 Hz when pitch projects one-frame altitude above the epsilon', () => {
    const state = createInitialState(B737_800_SPEC);
    state.flightPhase = 'TAKEOFF';
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 90;
    state.velocity.w = 0;
    state.config.gearDown = true;
    setAttitude(state, { ...state.attitude, theta: 10 * Math.PI / 180 });

    integrate(state, takeoffRollInputs({ elevator: -1 }), B737_800_SPEC, 1 / 60);

    const derived = computeDerived(state);
    expect(state.ground.weightOnWheels).toBe(true);
    expect(state.position.alt).toBeLessThanOrEqual(KSEA_RUNWAY_ALT_FT + GROUND_CONTACT_EPSILON_FT);
    expect(Math.abs(derived.vs)).toBeLessThan(300);
  });

  it('does not clamp vertical speed for an already-airborne aircraft above the runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT + 1000;
    state.ground = {
      ...state.ground,
      aglFt: 1000,
      weightOnWheels: false,
      normalForceN: 0,
      onRunway: false,
      contact: 'none',
    };
    state.velocity.u = 90;
    state.velocity.w = 0;
    state.config.gearDown = false;
    setAttitude(state, { ...state.attitude, theta: 10 * Math.PI / 180 });

    integrate(state, takeoffRollInputs({ gearLever: 'UP' }), B737_800_SPEC, 1 / 60);

    const derived = computeDerived(state);
    expect(state.ground.weightOnWheels).toBe(false);
    expect(derived.vs).toBeGreaterThan(300);
  });

  it('does not climb like a rocket with gear down and flaps 5 after rotation', () => {
    const climb = runGearDownRotationAfterTakeoffRoll();
    const derived = computeDerived(climb);

    expect(derived.vs).toBeLessThan(6000);
  });

  it('does not report negative AoA while climbing after rotation', () => {
    const climb = runGearDownRotationAfterTakeoffRoll();
    const derived = computeDerived(climb);

    expect(derived.vs).toBeGreaterThan(0);
    expect(derived.aoa).toBeGreaterThan(0);
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

  it('touches down into a damped rollout and decelerates on brakes', () => {
    const s = createInitialState(B737_800_SPEC);
    const approachPitchRad = 2 * Math.PI / 180;
    const targetSinkRateMps = 1.6;
    setAttitude(s, { phi: 0, theta: approachPitchRad, psi: Math.PI });
    s.flightPhase = 'APPROACH';
    s.position.alt = KSEA_RUNWAY_ALT_FT + 1;
    s.ground = {
      ...s.ground,
      aglFt: 1,
      weightOnWheels: false,
      normalForceN: 0,
      lastTouchdownSinkRateMps: 0,
      onRunway: false,
      contact: 'none',
      gearStations: createB737GearStations(0, false),
    };
    s.config.gearDown = true;
    s.config.flapSetting = 30;
    s.velocity.u = ktToMs(118);
    s.velocity.v = 0;
    s.velocity.w = (targetSinkRateMps + Math.sin(approachPitchRad) * s.velocity.u) / Math.cos(approachPitchRad);

    const rollout: ControlInputs = {
      ...idle,
      flapLever: 30,
      gearLever: 'DOWN',
      spoilers: 1,
      brake: 0.7,
    };

    let touchedDown = false;
    let touchdownSpeedMps = 0;
    let touchdownSinkRateMps = 0;
    for (let i = 0; i < 15 * 120; i += 1) {
      integrate(s, rollout, B737_800_SPEC, 1 / 120);
      if (!touchedDown && s.ground.weightOnWheels) {
        touchedDown = true;
        touchdownSpeedMps = s.velocity.u;
        touchdownSinkRateMps = s.ground.lastTouchdownSinkRateMps;
      }
    }

    const derived = computeDerived(s);
    expect(touchedDown).toBe(true);
    expect(touchdownSinkRateMps).toBeGreaterThan(0.5);
    expect(touchdownSinkRateMps).toBeLessThan(4);
    expect(s.ground.weightOnWheels).toBe(true);
    expect(s.flightPhase).toBe('LANDED');
    expect(s.position.alt).toBeCloseTo(KSEA_RUNWAY_ALT_FT, 1);
    expect(s.velocity.u).toBeLessThan(touchdownSpeedMps - 10);
    expect(Math.abs(derived.vs)).toBeLessThan(300);
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
    expect(s.velocity.u).toBeGreaterThan(29);
    expect(s.attitude.theta).toBeGreaterThan(0);
  });

  it('keyboard pitch-up command rotates once takeoff speed builds', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = KSEA_RUNWAY_ALT_FT;
    s.config.gearDown = true;
    s.config.flapSetting = 5;
    s.velocity.u = 90;
    s.engines[0].n1 = 100;
    s.engines[1].n1 = 100;
    const keyboardPitchUp: ControlInputs = {
      ...idle,
      ...computeHeldKeyInputs(new Set(['w'])),
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
    };

    for (let i = 0; i < 90; i++) integrate(s, keyboardPitchUp, B737_800_SPEC, 1 / 60);

    expect(s.attitude.theta).toBeGreaterThan(0);
  });

  it('keyboard pitch-up command lifts off within three seconds after rotate cue', () => {
    const s = runFixedStepScenario({ hz: 120, seconds: 30 });
    s.flightPhase = 'TAKEOFF';
    const keyboardPitchUp: ControlInputs = {
      ...takeoffRollInputs(),
      ...computeHeldKeyInputs(new Set(['w'])),
    };

    for (let i = 0; i < 3 * 120; i++) {
      integrate(s, keyboardPitchUp, B737_800_SPEC, 1 / 120);
    }

    expect(s.position.alt).toBeGreaterThan(KSEA_RUNWAY_ALT_FT + 5);
    expect(s.attitude.theta).toBeGreaterThan(0);
  });

  it('does not lift off at 80 kt even with an extreme pitch attitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.flightPhase = 'TAKEOFF';
    s.position.alt = KSEA_RUNWAY_ALT_FT;
    s.velocity.u = ktToMs(80);
    s.config.gearDown = true;
    s.config.flapSetting = 5;
    setAttitude(s, { ...s.attitude, theta: 15 * Math.PI / 180 });

    for (let i = 0; i < 30; i++) {
      integrate(s, takeoffRollInputs({ elevator: -1 }), B737_800_SPEC, 1 / 60);
    }

    expect(s.ground.weightOnWheels).toBe(true);
    expect(s.position.alt).toBeCloseTo(KSEA_RUNWAY_ALT_FT, 1);
  });

  it('held rotate does not over-rotate into a rocket attitude', () => {
    const s = runFixedStepScenario({ hz: 120, seconds: 30 });
    s.flightPhase = 'TAKEOFF';
    const keyboardPitchUp: ControlInputs = {
      ...takeoffRollInputs(),
      ...computeHeldKeyInputs(new Set(['w'])),
    };

    for (let i = 0; i < 3 * 120; i++) {
      integrate(s, keyboardPitchUp, B737_800_SPEC, 1 / 120);
    }

    expect(s.position.alt).toBeGreaterThan(KSEA_RUNWAY_ALT_FT + 30);
    expect(s.attitude.theta).toBeLessThanOrEqual(16 * Math.PI / 180);
  });

  it('holding rotate is not snapped to a hidden exact 15 degree attitude', () => {
    const s = runFixedStepScenario({ hz: 120, seconds: 30 });
    s.flightPhase = 'TAKEOFF';
    const keyboardPitchUp: ControlInputs = {
      ...takeoffRollInputs(),
      ...computeHeldKeyInputs(new Set(['w'])),
    };

    for (let i = 0; i < 4 * 120; i++) {
      integrate(s, keyboardPitchUp, B737_800_SPEC, 1 / 120);
    }

    const hiddenClampPitch = 15 * Math.PI / 180;
    expect(Math.abs(s.attitude.theta - hiddenClampPitch)).toBeGreaterThan(0.05 * Math.PI / 180);
  });

  it('early climb remains recoverable after releasing rotate and raising gear', () => {
    const s = runFixedStepScenario({ hz: 120, seconds: 30 });
    s.flightPhase = 'TAKEOFF';
    const keyboardPitchUp: ControlInputs = {
      ...takeoffRollInputs(),
      ...computeHeldKeyInputs(new Set(['w'])),
    };

    for (let i = 0; i < 3 * 120; i++) {
      integrate(s, keyboardPitchUp, B737_800_SPEC, 1 / 120);
    }

    const climbRelease: ControlInputs = {
      ...takeoffRollInputs(),
      elevator: 0,
      gearLever: 'UP',
    };

    for (let i = 0; i < 5 * 120; i++) {
      integrate(s, climbRelease, B737_800_SPEC, 1 / 120);
    }

    expect(s.flightPhase).toBe('CLIMB');
    expect(s.config.gearDown).toBe(false);
    expect(s.position.alt).toBeGreaterThan(KSEA_RUNWAY_ALT_FT + 100);
    expect(s.attitude.theta).toBeGreaterThan(-5 * Math.PI / 180);
  });

  it('transitions to climb on positive rate even if the gear remains down', () => {
    const s = runFixedStepScenario({ hz: 120, seconds: 30 });
    s.flightPhase = 'TAKEOFF';
    const keyboardPitchUp: ControlInputs = {
      ...takeoffRollInputs(),
      ...computeHeldKeyInputs(new Set(['w'])),
      gearLever: 'DOWN',
    };

    for (let i = 0; i < 8 * 120; i++) {
      integrate(s, keyboardPitchUp, B737_800_SPEC, 1 / 120);
    }

    expect(s.position.alt).toBeGreaterThan(KSEA_RUNWAY_ALT_FT + 50);
    expect(s.config.gearDown).toBe(true);
    expect(s.flightPhase).toBe('CLIMB');
  });

  it('does not transition to climb while above the runway but descending', () => {
    const s = createInitialState(B737_800_SPEC);
    s.flightPhase = 'TAKEOFF';
    s.position.alt = KSEA_RUNWAY_ALT_FT + 80;
    s.ground = { ...s.ground, weightOnWheels: false, contact: 'none', onRunway: false, aglFt: 80, normalForceN: 0 };
    s.config.gearDown = true;
    s.velocity.u = 80;
    s.velocity.w = 5;

    integrate(s, takeoffRollInputs({ gearLever: 'DOWN' }), B737_800_SPEC, 1 / 120);

    expect(s.flightPhase).toBe('TAKEOFF');
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
