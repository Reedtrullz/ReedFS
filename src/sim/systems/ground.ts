import type { AircraftState, ControlInputs, GearStationState, GroundContactType, GroundState } from '../types';
import { createB737GearStations } from '../types';
import { bodyToNed, nedToBody } from '../physics/frames';
import { eulerToQuat } from '../physics/quaternion';

export const KSEA_RUNWAY_ALT_FT = 432;
export const GROUND_CONTACT_EPSILON_FT = 0.5;
const G = 9.80665;

const ROLLING_FRICTION_COEFFICIENT = 0.35 / G;
const MAX_BRAKE_COEFFICIENT = 6.0 / G;
const STOP_EPSILON_MPS = 0.05;
const BREAKAWAY_THROTTLE = 0.05;
const MIN_GROUND_PITCH_RAD = 0;
const MAX_GROUND_PITCH_RAD = 0.35;
const MAX_GROUND_ROLL_RAD = 0.2;

export type GroundContactResult = GroundState;

export interface GroundContactOptions {
  normalForceN?: number;
  allowLiftoff?: boolean;
}

export interface GroundRollForceBreakdown {
  rollingNormalForceN: number;
  brakeNormalForceN: number;
  rollingFrictionForceN: number;
  brakeForceN: number;
  retardingForceN: number;
  accelerationMps2: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hasBreakawayThrustCommand(inputs: ControlInputs): boolean {
  return Math.max(inputs.throttle1, inputs.throttle2) > BREAKAWAY_THROTTLE;
}

function grossWeightForceN(state: AircraftState): number {
  return Math.max(0, state.grossWeight) * G;
}

function setGroundState(
  state: AircraftState,
  groundAltFt: number,
  contact: GroundContactType,
  weightOnWheels: boolean,
  normalForceN: number,
): GroundState {
  const aglFt = Math.max(0, state.position.alt - groundAltFt);
  const gearStations = createB737GearStations(
    contact === 'gear' && weightOnWheels ? normalForceN : 0,
    contact === 'gear' && weightOnWheels,
  );
  const ground: GroundState = {
    aglFt,
    groundAltFt,
    weightOnWheels,
    normalForceN,
    onRunway: contact !== 'none',
    contact,
    gearStations,
  };
  state.ground = ground;
  return ground;
}

export function constrainRunwayNormalVelocity(state: AircraftState): void {
  const ned = bodyToNed(state.velocity, state.attitude);
  state.velocity = nedToBody({ ...ned, down: 0 }, state.attitude);
}

export function computeGroundRollForces(
  state: AircraftState,
  inputs: ControlInputs,
  gearStations: GearStationState[] = state.ground.gearStations,
): GroundRollForceBreakdown {
  const loadedStations = gearStations.filter((station) => station.weightOnWheel);
  const rollingNormalForceN = loadedStations.reduce((sum, station) => sum + Math.max(0, station.normalForceN), 0);
  const brakeNormalForceN = loadedStations
    .filter((station) => station.brakeCapable)
    .reduce((sum, station) => sum + Math.max(0, station.normalForceN), 0);
  const brake = clamp01(inputs.brake);
  const rollingFrictionForceN = ROLLING_FRICTION_COEFFICIENT * rollingNormalForceN;
  const brakeForceN = brake * MAX_BRAKE_COEFFICIENT * brakeNormalForceN;
  const retardingForceN = rollingFrictionForceN + brakeForceN;
  return {
    rollingNormalForceN,
    brakeNormalForceN,
    rollingFrictionForceN,
    brakeForceN,
    retardingForceN,
    accelerationMps2: retardingForceN / Math.max(1, state.grossWeight),
  };
}

function applyLongitudinalGroundDecel(
  state: AircraftState,
  inputs: ControlInputs,
  dt: number,
  gearStations: GearStationState[],
): void {
  const speed = state.velocity.u;
  const breakawayThrust = hasBreakawayThrustCommand(inputs);

  if (Math.abs(speed) <= STOP_EPSILON_MPS && !breakawayThrust) {
    state.velocity.u = 0;
    return;
  }

  const forces = computeGroundRollForces(state, inputs, gearStations);
  const decel = forces.accelerationMps2 * Math.max(0, dt);

  if (speed > 0) {
    state.velocity.u = Math.max(0, speed - decel);
  } else {
    state.velocity.u = Math.min(0, speed + decel);
  }
}

function stabilizeGroundAttitude(state: AircraftState): void {
  const clampedPhi = Math.max(-MAX_GROUND_ROLL_RAD, Math.min(MAX_GROUND_ROLL_RAD, state.attitude.phi));
  const clampedTheta = Math.max(MIN_GROUND_PITCH_RAD, Math.min(MAX_GROUND_PITCH_RAD, state.attitude.theta));

  if (clampedPhi === state.attitude.phi && clampedTheta === state.attitude.theta) {
    return;
  }

  state.attitude.phi = clampedPhi;
  state.attitude.theta = clampedTheta;
  state.angularVel.p = 0;
  state.angularVel.q = 0;
  state.quaternion = eulerToQuat(clampedPhi, clampedTheta, state.attitude.psi);
}

export function applyGroundContact(
  state: AircraftState,
  inputs: ControlInputs,
  dt: number,
  groundAltFt = KSEA_RUNWAY_ALT_FT,
  options: GroundContactOptions = {},
): GroundContactResult {
  const gearAvailableForContact = state.config.gearDown || inputs.gearLever === 'DOWN';
  const atOrBelowGround = state.position.alt <= groundAltFt + GROUND_CONTACT_EPSILON_FT;
  const runwayDownMps = bodyToNed(state.velocity, state.attitude).down;

  if (!atOrBelowGround) {
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (!state.ground.weightOnWheels && state.position.alt >= groundAltFt && runwayDownMps < 0) {
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (options.allowLiftoff && gearAvailableForContact && state.ground.weightOnWheels) {
    state.position.alt = Math.max(state.position.alt, groundAltFt);
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (!gearAvailableForContact) {
    const contact: GroundContactType = runwayDownMps > 5 ? 'crashed' : 'belly';
    state.position.alt = groundAltFt;
    constrainRunwayNormalVelocity(state);
    return setGroundState(state, groundAltFt, contact, false, options.normalForceN ?? grossWeightForceN(state));
  }

  const gearNormalForceN = options.normalForceN ?? grossWeightForceN(state);
  const loadedGearStations = createB737GearStations(gearNormalForceN, true);
  state.position.alt = groundAltFt;
  state.config.gearDown = true;

  stabilizeGroundAttitude(state);
  applyLongitudinalGroundDecel(state, inputs, dt, loadedGearStations);
  constrainRunwayNormalVelocity(state);

  return setGroundState(state, groundAltFt, 'gear', true, gearNormalForceN);
}
