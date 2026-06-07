import { describe, it, expect } from 'vitest';
import { integrate } from '../integrate';
import { createInitialState, B737_800_SPEC, createB737GearStations } from '../../types';
import type { Attitude, ControlInputs, GeoPosition } from '../../types';
import type { WindInfo } from '../../weather';
import { eulerToQuat } from '../quaternion';
import { computeDerived } from '../derived';
import { ktToMs } from '../units';
import { GROUND_CONTACT_EPSILON_FT, KSEA_RUNWAY_ALT_FT } from '../../systems/ground';
import { computeHeldKeyInputs } from '../../../input/keyboardControls';
import { runFixedStepScenario, takeoffRollInputs } from '../../__tests__/scenarioHelpers';
import { createAircraftStateForScenario, KSEA_TUTORIAL_SCENARIO } from '../../scenarios';
import { KPDX_RUNWAY_10R, KSEA_RUNWAY_16L, type RunwayReference } from '../../../viewport/runwayData';
import { bodyToNed } from '../frames';

const idle: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 0,
};

function setAttitude(s: ReturnType<typeof createInitialState>, attitude: Attitude): void {
  s.attitude = attitude;
  s.quaternion = eulerToQuat(attitude.phi, attitude.theta, attitude.psi);
}

function normalizeAngleRad(angleRad: number): number {
  return Math.atan2(Math.sin(angleRad), Math.cos(angleRad));
}

function runwayHeadingDeltaRad(state: ReturnType<typeof createInitialState>): number {
  return normalizeAngleRad(state.attitude.psi - ksea16LHeadingRad());
}

function runwayLateralDisplacementM(state: ReturnType<typeof createInitialState>): number {
  const metersPerDegreeLon = 111_320 * Math.cos(KSEA_RUNWAY_16L.start.lat * Math.PI / 180);
  return (state.position.lon - KSEA_RUNWAY_16L.start.lon) * metersPerDegreeLon;
}

function degToRad(deg: number): number {
  return deg * Math.PI / 180;
}

function offsetPositionMeters(
  position: { lat: number; lon: number; altFt?: number; alt?: number },
  northM: number,
  eastM: number,
): { lat: number; lon: number; alt: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(position.lat * Math.PI / 180);
  return {
    lat: position.lat + northM / metersPerDegreeLat,
    lon: position.lon + eastM / metersPerDegreeLon,
    alt: position.alt ?? position.altFt ?? KSEA_RUNWAY_ALT_FT,
  };
}

function geoPositionForRunwayStart(runway: RunwayReference): GeoPosition {
  return { lat: runway.start.lat, lon: runway.start.lon, alt: runway.elevationFt };
}

function ksea16LHeadingRad(): number {
  return KSEA_RUNWAY_16L.headingDeg * Math.PI / 180;
}

function setRunwayHeading(state: ReturnType<typeof createInitialState>): void {
  setAttitude(state, { ...state.attitude, psi: ksea16LHeadingRad() });
}

function ksea16LHeadingDeltaRad(state: ReturnType<typeof createInitialState>): number {
  return normalizeAngleRad(state.attitude.psi - ksea16LHeadingRad());
}

function ksea16LPositionMeters(
  alongTrackM: number,
  lateralOffsetM: number,
  altFt = KSEA_RUNWAY_ALT_FT,
): { lat: number; lon: number; alt: number } {
  const headingRad = ksea16LHeadingRad();
  return offsetPositionMeters(
    { ...KSEA_RUNWAY_16L.start, alt: altFt },
    alongTrackM * Math.cos(headingRad) - lateralOffsetM * Math.sin(headingRad),
    alongTrackM * Math.sin(headingRad) + lateralOffsetM * Math.cos(headingRad),
  );
}

function ksea16LRunwayCoordinatesM(state: ReturnType<typeof createInitialState>): { alongTrackM: number; lateralOffsetM: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(KSEA_RUNWAY_16L.start.lat * Math.PI / 180);
  const northM = (state.position.lat - KSEA_RUNWAY_16L.start.lat) * metersPerDegreeLat;
  const eastM = (state.position.lon - KSEA_RUNWAY_16L.start.lon) * metersPerDegreeLon;
  const headingRad = ksea16LHeadingRad();
  return {
    alongTrackM: northM * Math.cos(headingRad) + eastM * Math.sin(headingRad),
    lateralOffsetM: -northM * Math.sin(headingRad) + eastM * Math.cos(headingRad),
  };
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

  it('applies pilot configuration controls before the first aero solve of a tick', () => {
    const laggedConfig = airborneTakeoffConfigState(0);
    laggedConfig.config.flapSetting = 0;
    laggedConfig.config.speedBrake = 0;
    const preconfigured = structuredClone(laggedConfig);
    preconfigured.config.flapSetting = 30;
    preconfigured.config.speedBrake = 1;
    const controls: ControlInputs = {
      ...idle,
      flapLever: 30,
      gearLever: 'UP',
      spoilers: 1,
      throttle1: 0.7,
      throttle2: 0.7,
    };

    integrate(laggedConfig, controls, B737_800_SPEC, 1 / 60);
    integrate(preconfigured, controls, B737_800_SPEC, 1 / 60);

    expect(laggedConfig.config.flapSetting).toBe(30);
    expect(laggedConfig.config.speedBrake).toBe(1);
    expect(laggedConfig.velocity.u).toBeCloseTo(preconfigured.velocity.u, 6);
    expect(laggedConfig.velocity.w).toBeCloseTo(preconfigured.velocity.w, 6);
    expect(laggedConfig.angularVel.q).toBeCloseTo(preconfigured.angularVel.q, 6);
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

    integrate(s, idle, B737_800_SPEC, 0.1, tailwind);

    expect(s.velocity.u).toBeGreaterThan(0);
  });

  it('keeps a stopped gear-down aircraft on the runway instead of sinking below terrain', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position = ksea16LPositionMeters(100, 0, KSEA_RUNWAY_ALT_FT);
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

  it('marks ground contact off-runway when the aircraft is outside the prepared runway rectangle', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    setRunwayHeading(state);
    state.config.gearDown = true;
    state.velocity.u = 10;

    integrate(state, idle, B737_800_SPEC, 1 / 60);

    expect(state.ground.contact).toBe('gear');
    expect(state.ground.weightOnWheels).toBe(true);
    expect(state.ground.onRunway).toBe(false);
  });

  it('keeps a gear-down aircraft on prepared KPDX runway surface', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position = geoPositionForRunwayStart(KPDX_RUNWAY_10R);
    setAttitude(state, { ...state.attitude, psi: degToRad(KPDX_RUNWAY_10R.headingDeg) });
    state.config.gearDown = true;
    state.velocity.u = 0;
    state.velocity.v = 0;
    state.velocity.w = 0;

    integrate(state, idle, B737_800_SPEC, 1 / 60);

    expect(state.ground.contact).toBe('gear');
    expect(state.ground.weightOnWheels).toBe(true);
    expect(state.ground.onRunway).toBe(true);
    expect(state.ground.groundAltFt).toBeCloseTo(KPDX_RUNWAY_10R.elevationFt, 6);
  });

  it('keeps KPDX off-runway gear contact explicit without marking prepared runway', () => {
    const state = createInitialState(B737_800_SPEC);
    const headingRad = degToRad(KPDX_RUNWAY_10R.headingDeg);
    const lateralOffsetM = KPDX_RUNWAY_10R.widthM / 2 + 50;
    state.position = offsetPositionMeters(
      geoPositionForRunwayStart(KPDX_RUNWAY_10R),
      -Math.sin(headingRad) * lateralOffsetM,
      Math.cos(headingRad) * lateralOffsetM,
    );
    setAttitude(state, { ...state.attitude, psi: headingRad });
    state.config.gearDown = true;
    state.velocity.u = 0;
    state.velocity.v = 0;
    state.velocity.w = 0;

    integrate(state, idle, B737_800_SPEC, 1 / 60);

    expect(state.ground.contact).toBe('gear');
    expect(state.ground.weightOnWheels).toBe(true);
    expect(state.ground.onRunway).toBe(false);
    expect(state.ground.groundAltFt).toBeCloseTo(KPDX_RUNWAY_10R.elevationFt, 6);
  });

  it('transitions from KPDX takeoff to climb using current ground elevation', () => {
    const state = createInitialState(B737_800_SPEC);
    const groundAltFt = KPDX_RUNWAY_10R.elevationFt;
    state.flightPhase = 'TAKEOFF';
    state.position = { ...geoPositionForRunwayStart(KPDX_RUNWAY_10R), alt: groundAltFt + 80 };
    setAttitude(state, { phi: 0, theta: degToRad(5), psi: degToRad(KPDX_RUNWAY_10R.headingDeg) });
    state.ground = {
      ...state.ground,
      aglFt: 80,
      groundAltFt,
      weightOnWheels: false,
      normalForceN: 0,
      onRunway: false,
      contact: 'none',
    };
    state.config.gearDown = true;
    state.velocity.u = ktToMs(150);
    state.velocity.v = 0;
    state.velocity.w = -2;

    expect(bodyToNed(state.velocity, state.attitude).down).toBeLessThan(-0.25);

    integrate(state, idle, B737_800_SPEC, 1 / 120);

    expect(state.ground.weightOnWheels).toBe(false);
    expect(state.ground.groundAltFt).toBeCloseTo(groundAltFt, 6);
    expect(state.flightPhase).toBe('CLIMB');
  });

  it('off-runway rollout decelerates faster than prepared-runway rollout without reversing', () => {
    const runway = createInitialState(B737_800_SPEC);
    runway.position = {
      lat: KSEA_RUNWAY_16L.start.lat,
      lon: KSEA_RUNWAY_16L.start.lon,
      alt: KSEA_RUNWAY_ALT_FT,
    };
    setRunwayHeading(runway);
    runway.velocity.u = ktToMs(60);
    runway.config.gearDown = true;

    const offRunway = createInitialState(B737_800_SPEC);
    offRunway.position = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);
    offRunway.position.alt = KSEA_RUNWAY_ALT_FT;
    setRunwayHeading(offRunway);
    offRunway.velocity.u = ktToMs(60);
    offRunway.config.gearDown = true;

    const braking: ControlInputs = { ...idle, brake: 0.5, spoilers: 1, gearLever: 'DOWN' };
    for (let i = 0; i < 5 * 120; i += 1) {
      integrate(runway, braking, B737_800_SPEC, 1 / 120);
      integrate(offRunway, braking, B737_800_SPEC, 1 / 120);
    }

    expect(runway.ground.onRunway).toBe(true);
    expect(offRunway.ground.onRunway).toBe(false);
    expect(offRunway.velocity.u).toBeGreaterThanOrEqual(-0.1);
    expect(offRunway.velocity.u).toBeLessThan(runway.velocity.u);
  });

  it('taxi rudder pedals steer at low speed while remaining on prepared KSEA 16L pavement', () => {
    const state = createInitialState(B737_800_SPEC);
    state.flightPhase = 'TAXI';
    state.position = ksea16LPositionMeters(120, 0);
    setRunwayHeading(state);
    state.velocity.u = ktToMs(12);
    state.config.gearDown = true;
    const taxiTurn: ControlInputs = { ...idle, rudder: 1, gearLever: 'DOWN' };

    for (let i = 0; i < 6 * 120; i += 1) {
      integrate(state, taxiTurn, B737_800_SPEC, 1 / 120);
    }

    const runwayCoordinates = ksea16LRunwayCoordinatesM(state);
    expect(ksea16LHeadingDeltaRad(state)).toBeGreaterThan(degToRad(5));
    expect(state.ground.contact).toBe('gear');
    expect(state.ground.weightOnWheels).toBe(true);
    expect(state.ground.onRunway).toBe(true);
    expect(Math.abs(runwayCoordinates.lateralOffsetM)).toBeLessThan(KSEA_RUNWAY_16L.widthM / 2);
    expect(state.position.alt).toBeCloseTo(KSEA_RUNWAY_ALT_FT, 1);
  });

  it('touches down from a crosswind approach into a damped on-runway KSEA 16L rollout', () => {
    const state = createInitialState(B737_800_SPEC);
    const approachPitchRad = 2 * Math.PI / 180;
    const targetSinkRateMps = 1.5;
    const crosswind: WindInfo = { dir: (KSEA_RUNWAY_16L.headingDeg + 90) % 360, speed: 8 };
    setAttitude(state, { phi: 0, theta: approachPitchRad, psi: ksea16LHeadingRad() });
    state.flightPhase = 'APPROACH';
    state.position = ksea16LPositionMeters(400, -5, KSEA_RUNWAY_ALT_FT + 1.2);
    state.ground = {
      ...state.ground,
      aglFt: 1.2,
      weightOnWheels: false,
      normalForceN: 0,
      lastTouchdownSinkRateMps: 0,
      onRunway: false,
      contact: 'none',
      gearStations: createB737GearStations(0, false),
    };
    state.config.gearDown = true;
    state.config.flapSetting = 30;
    state.velocity.u = ktToMs(118);
    state.velocity.v = ktToMs(5);
    state.velocity.w = (targetSinkRateMps + Math.sin(approachPitchRad) * state.velocity.u) / Math.cos(approachPitchRad);

    const rollout: ControlInputs = {
      ...idle,
      flapLever: 30,
      gearLever: 'DOWN',
      spoilers: 1,
      brake: 0.7,
    };

    let touchedDown = false;
    let touchdownOnRunway = false;
    let touchdownSideVelocityMps = 0;
    let touchdownSinkRateMps = 0;
    for (let i = 0; i < 10 * 120; i += 1) {
      const sideVelocityBeforeStepMps = Math.abs(state.velocity.v);
      const wasAirborne = !state.ground.weightOnWheels;
      integrate(state, rollout, B737_800_SPEC, 1 / 120, crosswind);
      if (!touchedDown && wasAirborne && state.ground.weightOnWheels) {
        touchedDown = true;
        touchdownOnRunway = state.ground.onRunway;
        touchdownSideVelocityMps = sideVelocityBeforeStepMps;
        touchdownSinkRateMps = state.ground.lastTouchdownSinkRateMps;
      }
    }

    const runwayCoordinates = ksea16LRunwayCoordinatesM(state);
    expect(touchedDown).toBe(true);
    expect(touchdownOnRunway).toBe(true);
    expect(touchdownSinkRateMps).toBeGreaterThan(0.5);
    expect(touchdownSideVelocityMps).toBeGreaterThan(ktToMs(4));
    expect(state.flightPhase).toBe('LANDED');
    expect(state.ground.contact).toBe('gear');
    expect(state.ground.weightOnWheels).toBe(true);
    expect(state.ground.onRunway).toBe(true);
    expect(Math.abs(state.velocity.v)).toBeLessThan(touchdownSideVelocityMps * 0.35);
    expect(Math.abs(runwayCoordinates.lateralOffsetM)).toBeLessThan(KSEA_RUNWAY_16L.widthM / 2);
  });

  it('rollout braking substantially reduces KSEA 16L groundspeed without reversing', () => {
    const createRollingState = () => {
      const state = createInitialState(B737_800_SPEC);
      state.flightPhase = 'LANDED';
      state.position = ksea16LPositionMeters(700, 0);
      setRunwayHeading(state);
      state.velocity.u = ktToMs(100);
      state.config.gearDown = true;
      return state;
    };
    const braked = createRollingState();
    const coasting = createRollingState();
    const initialAlongTrackM = ksea16LRunwayCoordinatesM(braked).alongTrackM;
    const initialGroundspeedKt = computeDerived(braked).gs;
    const braking: ControlInputs = { ...idle, brake: 1, spoilers: 1, gearLever: 'DOWN' };
    const noBrakes: ControlInputs = { ...idle, gearLever: 'DOWN' };

    for (let i = 0; i < 10 * 120; i += 1) {
      integrate(braked, braking, B737_800_SPEC, 1 / 120);
      integrate(coasting, noBrakes, B737_800_SPEC, 1 / 120);
    }

    const brakedGroundspeedKt = computeDerived(braked).gs;
    const coastingGroundspeedKt = computeDerived(coasting).gs;
    const brakedDistanceM = ksea16LRunwayCoordinatesM(braked).alongTrackM - initialAlongTrackM;
    const coastingDistanceM = ksea16LRunwayCoordinatesM(coasting).alongTrackM - initialAlongTrackM;
    expect(braked.ground.onRunway).toBe(true);
    expect(braked.ground.weightOnWheels).toBe(true);
    expect(braked.velocity.u).toBeGreaterThanOrEqual(0);
    expect(brakedGroundspeedKt).toBeLessThan(initialGroundspeedKt * 0.35);
    expect(coastingGroundspeedKt).toBeGreaterThan(brakedGroundspeedKt + 30);
    expect(brakedDistanceM).toBeLessThan(coastingDistanceM - 100);
  });

  it('keeps full-throttle takeoff roll on the runway before rotation speed', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position = ksea16LPositionMeters(200, 0, KSEA_RUNWAY_ALT_FT);
    setRunwayHeading(s);
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
    state.position = ksea16LPositionMeters(200, 0, KSEA_RUNWAY_ALT_FT);
    state.flightPhase = 'TAKEOFF';
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
    state.position = ksea16LPositionMeters(200, 0, KSEA_RUNWAY_ALT_FT);
    state.flightPhase = 'TAKEOFF';
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
    s.position = ksea16LPositionMeters(500, 0, KSEA_RUNWAY_ALT_FT);
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
    s.position = ksea16LPositionMeters(600, 0, KSEA_RUNWAY_ALT_FT + 1);
    setAttitude(s, { phi: 0, theta: approachPitchRad, psi: ksea16LHeadingRad() });
    s.flightPhase = 'APPROACH';
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
    onRunway.position = ksea16LPositionMeters(300, 0, KSEA_RUNWAY_ALT_FT);
    onRunway.config.gearDown = true;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    integrate(onRunway, gearUp, B737_800_SPEC, 1 / 60);

    expect(onRunway.config.gearDown).toBe(true);

    const airborne = createInitialState(B737_800_SPEC);
    airborne.position = ksea16LPositionMeters(300, 0, KSEA_RUNWAY_ALT_FT + 1000);
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
    s.position = ksea16LPositionMeters(400, 0, KSEA_RUNWAY_ALT_FT);
    setRunwayHeading(s);
    s.flightPhase = 'TAKEOFF';
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

  it('direct crosswinds weathercock takeoff rolls symmetrically into the wind', () => {
    const eastCrosswind = runFixedStepScenario({
      hz: 120,
      seconds: 20,
      inputs: takeoffRollInputs(),
      wind: { dir: 90, speed: 20 },
    });
    const westCrosswind = runFixedStepScenario({
      hz: 120,
      seconds: 20,
      inputs: takeoffRollInputs(),
      wind: { dir: 270, speed: 20 },
    });

    const eastDelta = runwayHeadingDeltaRad(eastCrosswind);
    const westDelta = runwayHeadingDeltaRad(westCrosswind);

    expect(eastDelta).toBeLessThan(-degToRad(2));
    expect(westDelta).toBeGreaterThan(degToRad(2));
    expect(Math.abs(Math.abs(eastDelta) - Math.abs(westDelta))).toBeLessThan(degToRad(2));
    expect(eastCrosswind.ground.weightOnWheels).toBe(true);
    expect(westCrosswind.ground.weightOnWheels).toBe(true);
  });

  it('bounded counter-rudder keeps a crosswind takeoff roll from spinning across the runway', () => {
    const state = runFixedStepScenario({
      hz: 120,
      seconds: 20,
      inputs: takeoffRollInputs({ rudder: -0.1 }),
      wind: { dir: 270, speed: 20 },
    });

    expect(Math.abs(runwayHeadingDeltaRad(state))).toBeLessThan(degToRad(25));
    expect(Math.abs(runwayLateralDisplacementM(state))).toBeLessThan(250);
    expect(state.velocity.u).toBeGreaterThan(40);
    expect(state.ground.weightOnWheels).toBe(true);
  });

  it('roll input produces negative roll rate', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position = ksea16LPositionMeters(300, 0, KSEA_RUNWAY_ALT_FT + 1000);
    s.config.gearDown = false;
    s.velocity.u = 128.6;
    const bank: ControlInputs = { ...idle, throttle1: 0.6, throttle2: 0.6, aileron: -1, gearLever: 'UP' };
    for (let i = 0; i < 30; i++) integrate(s, bank, B737_800_SPEC, 1/60);
    expect(s.angularVel.p).toBeLessThan(0);
  });
});
