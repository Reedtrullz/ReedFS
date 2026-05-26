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
const MAX_NOSEWHEEL_STEERING_RAD = 45 * Math.PI / 180;
const STEERING_FADE_START_MPS = 30;
const STEERING_FADE_END_MPS = 70;
const LATERAL_SCRUB_DAMPING_PER_SECOND = 0.9;
const TOUCHDOWN_MIN_SINK_RATE_MPS = 0.25;
const TOUCHDOWN_ANGULAR_DAMPING = 0.35;

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
  gearStationsOverride?: GearStationState[],
  touchdownSinkRateMps?: number,
): GroundState {
  const aglFt = Math.max(0, state.position.alt - groundAltFt);
  const gearStations = gearStationsOverride ?? createB737GearStations(
    contact === 'gear' && weightOnWheels ? normalForceN : 0,
    contact === 'gear' && weightOnWheels,
  );
  const lastTouchdownSinkRateMps = touchdownSinkRateMps !== undefined
    ? touchdownSinkRateMps
    : contact === 'gear' && weightOnWheels
      ? state.ground.lastTouchdownSinkRateMps
      : 0;
  const ground: GroundState = {
    aglFt,
    groundAltFt,
    weightOnWheels,
    normalForceN,
    lastTouchdownSinkRateMps,
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

export function computeNosewheelSteeringAngleRad(inputs: ControlInputs, forwardSpeedMps: number): number {
  const speed = Math.abs(forwardSpeedMps);
  const fade = speed <= STEERING_FADE_START_MPS
    ? 1
    : speed >= STEERING_FADE_END_MPS
      ? 0
      : (STEERING_FADE_END_MPS - speed) / (STEERING_FADE_END_MPS - STEERING_FADE_START_MPS);
  return clamp01(Math.abs(inputs.rudder)) * Math.sign(inputs.rudder) * MAX_NOSEWHEEL_STEERING_RAD * fade;
}

function wheelBaseM(gearStations: GearStationState[]): number {
  const nose = gearStations.find((station) => station.id === 'nose');
  const mains = gearStations.filter((station) => station.id === 'leftMain' || station.id === 'rightMain');
  if (!nose || mains.length === 0) return 18;
  const mainX = mains.reduce((sum, station) => sum + station.positionBodyM.x, 0) / mains.length;
  return Math.max(1, nose.positionBodyM.x - mainX);
}

function applyTouchdownDamping(state: AircraftState, sinkRateMps: number): void {
  if (sinkRateMps < TOUCHDOWN_MIN_SINK_RATE_MPS) return;
  state.angularVel.p *= TOUCHDOWN_ANGULAR_DAMPING;
  state.angularVel.q *= TOUCHDOWN_ANGULAR_DAMPING;
  state.angularVel.r *= TOUCHDOWN_ANGULAR_DAMPING;
}

function applyNosewheelSteering(
  state: AircraftState,
  inputs: ControlInputs,
  dt: number,
  gearStations: GearStationState[],
): GearStationState[] {
  const steeringAngleRad = computeNosewheelSteeringAngleRad(inputs, state.velocity.u);
  const nextStations = gearStations.map((station) => (
    station.id === 'nose' ? { ...station, steeringAngleRad } : station
  ));
  const speed = state.velocity.u;
  if (Math.abs(speed) > STOP_EPSILON_MPS && Math.abs(steeringAngleRad) > 1e-6) {
    state.angularVel.r = (speed / wheelBaseM(nextStations)) * Math.tan(steeringAngleRad);
  }

  const damping = Math.max(0, 1 - Math.max(0, dt) * LATERAL_SCRUB_DAMPING_PER_SECOND);
  state.velocity.v *= damping;
  return nextStations;
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
  const touchdownSinkRateMps = !state.ground.weightOnWheels && runwayDownMps > 0 ? runwayDownMps : undefined;

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
  let loadedGearStations = createB737GearStations(gearNormalForceN, true);
  state.position.alt = groundAltFt;
  state.config.gearDown = true;

  stabilizeGroundAttitude(state);
  applyTouchdownDamping(state, touchdownSinkRateMps ?? 0);
  loadedGearStations = applyNosewheelSteering(state, inputs, dt, loadedGearStations);
  applyLongitudinalGroundDecel(state, inputs, dt, loadedGearStations);
  constrainRunwayNormalVelocity(state);

  return setGroundState(state, groundAltFt, 'gear', true, gearNormalForceN, loadedGearStations, touchdownSinkRateMps);
}
