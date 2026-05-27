import { describe, expect, it } from 'vitest';
import {
  b737TakeoffProfiles,
  type TakeoffEnvelope,
} from '../../data/performance/b737TakeoffProfiles';
import { B737_800_SPEC, createInitialState, type AircraftState } from '../../types';
import { takeoffRollInputs } from '../../__tests__/scenarioHelpers';
import { KSEA_RUNWAY_16L } from '../../../viewport/runwayData';
import { computeDerived } from '../derived';
import { integrate } from '../integrate';
import { eulerToQuat } from '../quaternion';
import { radToDeg } from '../units';

const HZ = 120;
const DT = 1 / HZ;
const GRAVITY_MPS2 = 9.80665;
const ROTATION_TIMEOUT_SECONDS = 80;
const LIFTOFF_TIMEOUT_SECONDS = 20;
const INITIAL_CLIMB_SAMPLE_SECONDS = 8;
const INITIAL_CLIMB_PITCH_TARGET_DEG = 10;
const PITCH_DEADBAND_RAD = 0.25 * Math.PI / 180;

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

function midpoint([min, max]: [number, number]): number {
  return (min + max) / 2;
}

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

function expectWithinRange(value: number, range: [number, number], label: string): void {
  expect(value, `${label} ${value} is below ${range[0]}`).toBeGreaterThanOrEqual(range[0]);
  expect(value, `${label} ${value} is above ${range[1]}`).toBeLessThanOrEqual(range[1]);
}

describe('B737 takeoff performance envelopes', () => {
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
});
