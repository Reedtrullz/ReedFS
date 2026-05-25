import type { AircraftState, ControlInputs, GroundContactType, GroundState } from '../types';
import { eulerToQuat } from '../physics/quaternion';

export const KSEA_RUNWAY_ALT_FT = 432;
const G = 9.80665;

const GROUND_EPSILON_FT = 0.5;
const ROLLING_FRICTION_ACCEL_MPS2 = 0.35;
const MAX_BRAKE_ACCEL_MPS2 = 6.0;
const STOP_EPSILON_MPS = 0.05;
const BREAKAWAY_THROTTLE = 0.05;
const MIN_GROUND_PITCH_RAD = 0;
const MAX_GROUND_PITCH_RAD = 0.35;
const MAX_GROUND_ROLL_RAD = 0.2;

export type GroundContactResult = GroundState;

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
  const ground: GroundState = {
    aglFt,
    groundAltFt,
    weightOnWheels,
    normalForceN,
    onRunway: contact !== 'none',
    contact,
  };
  state.ground = ground;
  return ground;
}

function applyLongitudinalGroundDecel(state: AircraftState, inputs: ControlInputs, dt: number): void {
  const speed = state.velocity.u;
  const brake = clamp01(inputs.brake);
  const breakawayThrust = hasBreakawayThrustCommand(inputs);

  if (Math.abs(speed) <= STOP_EPSILON_MPS && !breakawayThrust) {
    state.velocity.u = 0;
    return;
  }

  const decel = (ROLLING_FRICTION_ACCEL_MPS2 + brake * MAX_BRAKE_ACCEL_MPS2) * Math.max(0, dt);

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
): GroundContactResult {
  const gearAvailableForContact = state.config.gearDown || inputs.gearLever === 'DOWN';
  const atOrBelowGround = state.position.alt <= groundAltFt + GROUND_EPSILON_FT;

  if (!atOrBelowGround) {
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (!gearAvailableForContact) {
    const contact: GroundContactType = state.velocity.w > 5 ? 'crashed' : 'belly';
    state.position.alt = groundAltFt;
    state.velocity.w = 0;
    return setGroundState(state, groundAltFt, contact, false, grossWeightForceN(state));
  }

  state.position.alt = groundAltFt;
  state.config.gearDown = true;
  state.velocity.w = 0;

  stabilizeGroundAttitude(state);
  applyLongitudinalGroundDecel(state, inputs, dt);

  return setGroundState(state, groundAltFt, 'gear', true, grossWeightForceN(state));
}
