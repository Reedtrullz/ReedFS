import type { AircraftState, ControlInputs } from '../types';
import { eulerToQuat } from '../physics/quaternion';

export const KSEA_RUNWAY_ALT_FT = 432;

const GROUND_EPSILON_FT = 0.5;
const ROLLING_FRICTION_ACCEL_MPS2 = 0.35;
const MAX_BRAKE_ACCEL_MPS2 = 6.0;
const STOP_EPSILON_MPS = 0.05;
const BREAKAWAY_THROTTLE = 0.05;
const MIN_GROUND_PITCH_RAD = 0;
const MAX_GROUND_PITCH_RAD = 0.35;
const MAX_GROUND_ROLL_RAD = 0.2;

export interface GroundContactResult {
  weightOnWheels: boolean;
  groundAltFt: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hasBreakawayThrustCommand(inputs: ControlInputs): boolean {
  return Math.max(inputs.throttle1, inputs.throttle2) > BREAKAWAY_THROTTLE;
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

  if (!gearAvailableForContact || !atOrBelowGround) {
    return { weightOnWheels: false, groundAltFt };
  }

  state.position.alt = groundAltFt;
  state.config.gearDown = true;
  state.velocity.w = 0;

  stabilizeGroundAttitude(state);
  applyLongitudinalGroundDecel(state, inputs, dt);

  return { weightOnWheels: true, groundAltFt };
}
