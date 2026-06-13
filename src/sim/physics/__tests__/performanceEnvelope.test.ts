import { describe, expect, it } from 'vitest';
import {
  b737TakeoffProfiles,
  type TakeoffEnvelope,
} from '../../data/performance/b737TakeoffProfiles';
import { b737PerformanceCards, findPerformanceCardForScenario } from '../../data/performance/b737PerformanceCards';
import { B737_800_SPEC, createInitialState, type AircraftState } from '../../types';
import type { ControlInputs } from '../../types';
import { takeoffRollInputs } from '../../__tests__/scenarioHelpers';
import { ENVA_TUTORIAL_SCENARIO, createAircraftStateForScenario } from '../../scenarios';
import { isPositiveRateEstablished } from '../../flightPhasePredicates';
import { KSEA_RUNWAY_16L } from '../../../viewport/runwayData';
import { computeEngineThrustN } from '../../systems/engine';
import * as b737PerformanceFixtures from '../../data/performance/b737PerformanceCards';
import { computeAero } from '../aero';
import { computeDerived } from '../derived';
import { integrate } from '../integrate';
import { eulerToQuat } from '../quaternion';
import { radToDeg } from '../units';
import { applyIasFlightCondition } from './fdmFixtureHelpers';

const HZ = 120;
const DT = 1 / HZ;
const GRAVITY_MPS2 = 9.80665;
const ROTATION_TIMEOUT_SECONDS = 80;
const LIFTOFF_TIMEOUT_SECONDS = 20;
const INITIAL_CLIMB_SAMPLE_SECONDS = 8;
const INITIAL_CLIMB_PITCH_TARGET_DEG = 10;
const PITCH_DEADBAND_RAD = 0.25 * Math.PI / 180;
const ENVA_MANUAL_TAKEOFF_TIMEOUT_SECONDS = 90;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface EnvelopeSample {
  speedAt20sKt: number;
  vrKt: number;
  initialClimbVsFpm: number;
  initialClimbAoADeg: number;
  gearDown: boolean;
  weightOnWheels: boolean;
}

interface EnvaInitialClimbSample {
  liftoffIasKt: number;
  maxPitchDeg: number;
  maxVerticalSpeedFpm: number;
  minIasAfterLiftoffKt: number;
  secondsSampledAfterLiftoff: number;
}

interface FixtureOwnership {
  sourceNote: string;
}

interface CleanClimbFixture {
  name: string;
  grossWeightKg: number;
  altitudeFt: number;
  iasKt: number;
  n1Percent: number;
  expectedClimbFpm: [number, number];
  ownership: FixtureOwnership;
}

interface CruiseTrimFixture {
  name: string;
  grossWeightKg: number;
  altitudeFt: number;
  iasKt: number;
  expectedAoADeg: [number, number];
  ownership: FixtureOwnership;
}

interface ApproachVrefFixture {
  name: string;
  grossWeightKg: number;
  heightAglFt: number;
  vrefKt: number;
  targetApproachIasKt: number;
  flapSetting: number;
  expectedAoADeg: [number, number];
  ownership: FixtureOwnership;
}

interface LandingPerformanceCardForEnvelopeTest {
  vrefKt: number;
  targetApproachIasKt: number;
  glidepathDeg: number;
  sinkRateFpm: [number, number];
  touchdownSinkRateMps: [number, number];
  touchdownZoneDistanceM: [number, number];
  stoppingDistanceM: [number, number];
}

const b737CleanClimbFixtures = (
  b737PerformanceFixtures as { b737CleanClimbFixtures?: CleanClimbFixture[] }
).b737CleanClimbFixtures ?? [];
const b737CruiseTrimFixtures = (
  b737PerformanceFixtures as { b737CruiseTrimFixtures?: CruiseTrimFixture[] }
).b737CruiseTrimFixtures ?? [];
const b737ApproachVrefFixtures = (
  b737PerformanceFixtures as { b737ApproachVrefFixtures?: ApproachVrefFixture[] }
).b737ApproachVrefFixtures ?? [];

const neutralControls: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0,
  throttle2: 0,
  flapLever: 0,
  gearLever: 'UP',
  spoilers: 0,
  brake: 0,
};

const MPS_TO_FPM = 196.850394;

function midpoint([min, max]: [number, number]): number {
  return (min + max) / 2;
}

const ENVA_PERFORMANCE_CARD = findPerformanceCardForScenario(ENVA_TUTORIAL_SCENARIO.id);

function createProfileState(profile: TakeoffEnvelope): AircraftState {
  const state = createInitialState(B737_800_SPEC);
  const usefulLoadKg = Math.max(0, profile.grossWeightKg - B737_800_SPEC.emptyWeight);
  const fuelLoadKg = clamp(
    profile.grossWeightKg < 55_000 ? 6_000 : profile.grossWeightKg < 70_000 ? 12_000 : 16_000,
    0,
    Math.min(usefulLoadKg, B737_800_SPEC.maxFuel),
  );
  const payloadWeightKg = usefulLoadKg - fuelLoadKg;
  const centerFuelKg = Math.min(fuelLoadKg, B737_800_SPEC.fuelCapacity.center);
  const remainingFuelKg = fuelLoadKg - centerFuelKg;
  const wingFuelKg = Math.min(remainingFuelKg / 2, B737_800_SPEC.fuelCapacity.left);

  state.position = {
    lat: KSEA_RUNWAY_16L.start.lat,
    lon: KSEA_RUNWAY_16L.start.lon,
    alt: profile.fieldElevationFt,
  };
  state.attitude = { ...state.attitude, psi: KSEA_RUNWAY_16L.headingDeg * Math.PI / 180 };
  state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
  state.ground = {
    ...state.ground,
    aglFt: 0,
    groundAltFt: profile.fieldElevationFt,
    weightOnWheels: true,
    normalForceN: profile.grossWeightKg * GRAVITY_MPS2,
    onRunway: true,
    contact: 'gear',
  };
  state.config.flapSetting = profile.flapSetting;
  state.config.gearDown = true;
  state.payloadWeight = payloadWeightKg;
  state.fuel.centerTank = centerFuelKg;
  state.fuel.leftTank = wingFuelKg;
  state.fuel.rightTank = wingFuelKg;
  state.fuel.totalFuel = centerFuelKg + wingFuelKg * 2;
  state.grossWeight = profile.grossWeightKg;
  state.flightPhase = 'TAKEOFF';

  return state;
}

function advance(state: AircraftState, profile: TakeoffEnvelope, seconds: number, elevator: number): void {
  const inputs = takeoffRollInputs({
    elevator,
    flapLever: profile.flapSetting,
    gearLever: 'DOWN',
  });

  for (let i = 0; i < seconds * HZ; i += 1) {
    integrate(state, inputs, B737_800_SPEC, DT);
  }
}

function holdInitialClimbPitch(state: AircraftState, targetPitchRad: number): number {
  if (state.attitude.theta < targetPitchRad - PITCH_DEADBAND_RAD) {
    return -0.2;
  }

  if (state.attitude.theta > targetPitchRad + PITCH_DEADBAND_RAD) {
    return 0.2;
  }

  return 0;
}

function runEnvelopeScenario(profile: TakeoffEnvelope): EnvelopeSample {
  const state = createProfileState(profile);
  const plannedRotateKt = profile.targetVrKt[0];
  const targetPitchRad = INITIAL_CLIMB_PITCH_TARGET_DEG * Math.PI / 180;

  advance(state, profile, 20, 0);
  const speedAt20sKt = computeDerived(state).ias;

  for (let i = 0; computeDerived(state).ias < plannedRotateKt && i < ROTATION_TIMEOUT_SECONDS * HZ; i += 1) {
    integrate(
      state,
      takeoffRollInputs({ elevator: 0, flapLever: profile.flapSetting, gearLever: 'DOWN' }),
      B737_800_SPEC,
      DT,
    );
  }

  const vrKt = computeDerived(state).ias;
  if (vrKt < plannedRotateKt) {
    throw new Error(`${profile.name} did not reach planned rotate speed ${plannedRotateKt} kt`);
  }

  let liftedOff = !state.ground.weightOnWheels;
  for (let i = 0; !liftedOff && i < LIFTOFF_TIMEOUT_SECONDS * HZ; i += 1) {
    const elevator = state.attitude.theta < targetPitchRad && state.ground.weightOnWheels ? -1 : 0;
    integrate(
      state,
      takeoffRollInputs({ elevator, flapLever: profile.flapSetting, gearLever: 'DOWN' }),
      B737_800_SPEC,
      DT,
    );
    liftedOff = !state.ground.weightOnWheels;
  }

  if (!liftedOff) {
    throw new Error(`${profile.name} did not lift off after rotation`);
  }

  for (let i = 0; i < INITIAL_CLIMB_SAMPLE_SECONDS * HZ; i += 1) {
    integrate(
      state,
      takeoffRollInputs({
        elevator: holdInitialClimbPitch(state, targetPitchRad),
        flapLever: profile.flapSetting,
        gearLever: 'DOWN',
      }),
      B737_800_SPEC,
      DT,
    );
  }

  const climb = computeDerived(state);
  return {
    speedAt20sKt,
    vrKt,
    initialClimbVsFpm: climb.vs,
    initialClimbAoADeg: radToDeg(climb.aoa),
    gearDown: state.config.gearDown,
    weightOnWheels: state.ground.weightOnWheels,
  };
}

function runEnvaTakeoffForSeconds(options: {
  seconds: number;
  throttle: number;
  rotateAtKt: number;
}): EnvaInitialClimbSample {
  const state = createAircraftStateForScenario(B737_800_SPEC, ENVA_TUTORIAL_SCENARIO);
  const targetPitchRad = ENVA_PERFORMANCE_CARD.initialClimbPitchDeg * Math.PI / 180;
  const sampleFrames = Math.ceil(options.seconds * HZ);
  const maxFrames = Math.ceil((ENVA_MANUAL_TAKEOFF_TIMEOUT_SECONDS + options.seconds) * HZ);
  let rotating = false;
  let liftedOff = false;
  let liftoffIasKt = 0;
  let sampledFrames = 0;
  let maxPitchDeg = Number.NEGATIVE_INFINITY;
  let maxVerticalSpeedFpm = Number.NEGATIVE_INFINITY;
  let minIasAfterLiftoffKt = Number.POSITIVE_INFINITY;

  state.flightPhase = 'TAKEOFF';

  for (let frame = 0; frame < maxFrames; frame += 1) {
    const before = computeDerived(state);
    if (!rotating && before.ias >= options.rotateAtKt) rotating = true;

    const elevator = (() => {
      if (!rotating) return 0;
      if (state.ground.weightOnWheels) return -1;
      return holdInitialClimbPitch(state, targetPitchRad);
    })();
    const gearLever = isPositiveRateEstablished(state) ? 'UP' : 'DOWN';

    integrate(
      state,
      takeoffRollInputs({
        elevator,
        throttle1: options.throttle,
        throttle2: options.throttle,
        flapLever: ENVA_PERFORMANCE_CARD.flapSetting,
        gearLever,
      }),
      B737_800_SPEC,
      DT,
    );

    if (!state.ground.weightOnWheels) {
      const after = computeDerived(state);
      if (!liftedOff) {
        liftedOff = true;
        liftoffIasKt = after.ias;
      }
      sampledFrames += 1;
      maxPitchDeg = Math.max(maxPitchDeg, radToDeg(state.attitude.theta));
      maxVerticalSpeedFpm = Math.max(maxVerticalSpeedFpm, after.vs);
      minIasAfterLiftoffKt = Math.min(minIasAfterLiftoffKt, after.ias);

      if (sampledFrames >= sampleFrames) break;
    }
  }

  if (!rotating) throw new Error(`ENVA tutorial did not reach rotate speed ${options.rotateAtKt} kt`);
  if (!liftedOff) throw new Error('ENVA tutorial did not lift off after rotation');
  if (sampledFrames < sampleFrames) {
    throw new Error(`ENVA tutorial sampled only ${(sampledFrames / HZ).toFixed(2)}s after liftoff`);
  }

  return {
    liftoffIasKt,
    maxPitchDeg,
    maxVerticalSpeedFpm,
    minIasAfterLiftoffKt,
    secondsSampledAfterLiftoff: sampledFrames / HZ,
  };
}

function createAirborneFixtureState(grossWeightKg: number, altitudeFt: number): AircraftState {
  const state = createInitialState(B737_800_SPEC);
  state.grossWeight = grossWeightKg;
  state.cg = 25;
  state.position.alt = altitudeFt;
  state.ground = { ...state.ground, groundAltFt: 0, aglFt: altitudeFt, weightOnWheels: false, contact: 'none' };
  return state;
}

function estimateExcessPowerClimbFpm(fixture: CleanClimbFixture): number {
  const state = createAirborneFixtureState(fixture.grossWeightKg, fixture.altitudeFt);
  applyIasFlightCondition(state, {
    iasKt: fixture.iasKt,
    altitudeFt: fixture.altitudeFt,
    flapSetting: 0,
    gearDown: false,
    speedBrake: 0,
  });
  const mach = Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w) / 340;
  const thrustPerEngine = computeEngineThrustN(fixture.n1Percent, B737_800_SPEC, state.position.alt, mach);
  state.engines[0].thrust = thrustPerEngine;
  state.engines[1].thrust = thrustPerEngine;
  const aero = computeAero(state, neutralControls, B737_800_SPEC);
  const excessForwardForceN = aero.thrust + aero.dragBodyX;
  return (excessForwardForceN * Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w) / aero.weight) * MPS_TO_FPM;
}

function findLevelAoADeg(options: {
  grossWeightKg: number;
  altitudeFt: number;
  iasKt: number;
  flapSetting: number;
  gearDown: boolean;
}): number {
  const state = createAirborneFixtureState(options.grossWeightKg, options.altitudeFt);
  let low = -5 * Math.PI / 180;
  let high = 15 * Math.PI / 180;

  for (let i = 0; i < 50; i += 1) {
    const mid = (low + high) / 2;
    applyIasFlightCondition(state, {
      iasKt: options.iasKt,
      altitudeFt: options.altitudeFt,
      angleOfAttackRad: mid,
      flapSetting: options.flapSetting,
      gearDown: options.gearDown,
      speedBrake: 0,
    });
    const aero = computeAero(state, {
      ...neutralControls,
      flapLever: options.flapSetting,
      gearLever: options.gearDown ? 'DOWN' : 'UP',
    }, B737_800_SPEC);
    if (aero.lift / aero.weight < 1) low = mid;
    else high = mid;
  }

  return radToDeg((low + high) / 2);
}

function expectWithinRange(value: number, range: [number, number], label: string): void {
  expect(value, `${label} ${value} is below ${range[0]}`).toBeGreaterThanOrEqual(range[0]);
  expect(value, `${label} ${value} is above ${range[1]}`).toBeLessThanOrEqual(range[1]);
}

describe('B737 takeoff performance envelopes', () => {
  it.each(b737PerformanceCards)('$scenarioId defines bounded landing performance acceptance metrics', (card) => {
    const landing = (card as typeof card & { landing?: LandingPerformanceCardForEnvelopeTest }).landing;

    expect(landing, `${card.scenarioId} missing landing performance card`).toBeDefined();
    expect(landing?.vrefKt).toBe(card.approach.vrefKt);
    expect(landing?.targetApproachIasKt).toBe(card.approach.iasKt);
    expectWithinRange(landing?.glidepathDeg ?? Number.NaN, [2.5, 3.5], `${card.scenarioId} glidepath`);
    expectWithinRange(landing?.sinkRateFpm[0] ?? Number.NaN, [400, 900], `${card.scenarioId} minimum approach sink`);
    expectWithinRange(landing?.sinkRateFpm[1] ?? Number.NaN, [500, 1_000], `${card.scenarioId} maximum approach sink`);
    expectWithinRange(landing?.touchdownSinkRateMps[0] ?? Number.NaN, [0.1, 3], `${card.scenarioId} minimum touchdown sink`);
    expectWithinRange(landing?.touchdownSinkRateMps[1] ?? Number.NaN, [3, 14.9], `${card.scenarioId} maximum touchdown sink`);
    expect(landing?.touchdownZoneDistanceM[0]).toBeGreaterThanOrEqual(0);
    expect(landing?.touchdownZoneDistanceM[1]).toBeLessThanOrEqual(900);
    expect(landing?.stoppingDistanceM[0]).toBeGreaterThan(0);
    expect(landing?.stoppingDistanceM[1]).toBeGreaterThan(landing?.stoppingDistanceM[0] ?? 0);
  });

  it('defines honest clean-climb, cruise-trim, and approach VREF fixtures with non-AFM metadata', () => {
    expect(b737CleanClimbFixtures.length).toBeGreaterThanOrEqual(2);
    expect(b737CruiseTrimFixtures.length).toBeGreaterThanOrEqual(2);
    expect(b737ApproachVrefFixtures.length).toBeGreaterThanOrEqual(2);

    for (const fixture of [
      ...b737CleanClimbFixtures,
      ...b737CruiseTrimFixtures,
      ...b737ApproachVrefFixtures,
    ]) {
      expect(fixture.ownership.sourceNote).toMatch(/not certified/i);
      expect(fixture.ownership.sourceNote).toMatch(/not an? AFM/i);
    }
  });

  it.each(b737CleanClimbFixtures)('$name stays inside the placeholder clean-climb gate', (fixture) => {
    expectWithinRange(
      estimateExcessPowerClimbFpm(fixture),
      fixture.expectedClimbFpm,
      `${fixture.name} excess-power climb`,
    );
  });

  it.each(b737CruiseTrimFixtures)('$name stays inside the placeholder cruise-trim AoA gate', (fixture) => {
    const levelAoADeg = findLevelAoADeg({
      grossWeightKg: fixture.grossWeightKg,
      altitudeFt: fixture.altitudeFt,
      iasKt: fixture.iasKt,
      flapSetting: 0,
      gearDown: false,
    });

    expectWithinRange(levelAoADeg, fixture.expectedAoADeg, `${fixture.name} level AoA`);
  });

  it.each(b737ApproachVrefFixtures)('$name keeps VREF+additive approach AoA plausible', (fixture) => {
    expect(fixture.targetApproachIasKt).toBeGreaterThanOrEqual(fixture.vrefKt);
    expect(fixture.targetApproachIasKt).toBeLessThanOrEqual(fixture.vrefKt + 15);

    const levelAoADeg = findLevelAoADeg({
      grossWeightKg: fixture.grossWeightKg,
      altitudeFt: fixture.heightAglFt,
      iasKt: fixture.targetApproachIasKt,
      flapSetting: fixture.flapSetting,
      gearDown: true,
    });

    expectWithinRange(levelAoADeg, fixture.expectedAoADeg, `${fixture.name} approach AoA`);
  });

  it('defines light, medium, and heavy flaps-5 takeoff fixtures with protective bounds', () => {
    expect(b737TakeoffProfiles).toHaveLength(3);
    expect(b737TakeoffProfiles.map((profile) => profile.name)).toEqual([
      'Light takeoff - low payload/fuel, flaps 5',
      'Medium takeoff - default tutorial weight, flaps 5',
      'Heavy takeoff - near MTOW, flaps 5',
    ]);

    for (let i = 1; i < b737TakeoffProfiles.length; i += 1) {
      expect(b737TakeoffProfiles[i].grossWeightKg).toBeGreaterThan(b737TakeoffProfiles[i - 1].grossWeightKg);
      expect(midpoint(b737TakeoffProfiles[i].targetVrKt)).toBeGreaterThan(
        midpoint(b737TakeoffProfiles[i - 1].targetVrKt),
      );
    }

    for (const profile of b737TakeoffProfiles) {
      expect(profile.flapSetting).toBe(5);
      expect(profile.initialClimbVsFpm[1]).toBeLessThan(10_000);
      expect(profile.initialClimbAoADeg[0]).toBeGreaterThan(0);
    }
  });

  it.each(b737TakeoffProfiles)('$name stays inside its takeoff performance envelope', (profile) => {
    const sample = runEnvelopeScenario(profile);

    expectWithinRange(sample.speedAt20sKt, profile.targetSpeedAt20sKt, `${profile.name} 20s IAS`);
    expectWithinRange(sample.vrKt, profile.targetVrKt, `${profile.name} rotate IAS`);
    expectWithinRange(sample.initialClimbVsFpm, profile.initialClimbVsFpm, `${profile.name} gear-down initial climb VS`);
    expectWithinRange(sample.initialClimbAoADeg, profile.initialClimbAoADeg, `${profile.name} initial climb AoA`);
    expect(sample.gearDown).toBe(true);
    expect(sample.weightOnWheels).toBe(false);
  });

  it('ENVA tutorial manual climb stays inside a bounded initial climb envelope', () => {
    const sample = runEnvaTakeoffForSeconds({
      seconds: 20,
      throttle: 1,
      rotateAtKt: ENVA_PERFORMANCE_CARD.vSpeeds.vrKt,
    });

    expect(sample.liftoffIasKt).toBeGreaterThanOrEqual(125);
    expect(sample.maxPitchDeg).toBeLessThanOrEqual(18);
    expect(sample.maxVerticalSpeedFpm).toBeLessThanOrEqual(4_200);
    expect(sample.minIasAfterLiftoffKt).toBeGreaterThanOrEqual(125);
    expect(sample.secondsSampledAfterLiftoff).toBeGreaterThanOrEqual(20);
  });
});
