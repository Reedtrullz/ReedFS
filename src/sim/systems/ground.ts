import type { AircraftState, ControlInputs } from '../types';

export const KSEA_RUNWAY_ALT_FT = 432;

const GROUND_EPSILON_FT = 0.5;
const ROLLING_FRICTION_ACCEL_MPS2 = 0.35;
const MAX_BRAKE_ACCEL_MPS2 = 6.0;
const STOP_EPSILON_MPS = 0.05;

export interface GroundContactResult {
  weightOnWheels: boolean;
  groundAltFt: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function applyLongitudinalGroundDecel(state: AircraftState, inputs: ControlInputs, dt: number): void {
  const speed = state.velocity.u;
  if (Math.abs(speed) <= STOP_EPSILON_MPS) {
    state.velocity.u = 0;
    return;
  }

  const brake = clamp01(inputs.brake);
  const decel = (ROLLING_FRICTION_ACCEL_MPS2 + brake * MAX_BRAKE_ACCEL_MPS2) * Math.max(0, dt);

  if (speed > 0) {
    state.velocity.u = Math.max(0, speed - decel);
  } else {
    state.velocity.u = Math.min(0, speed + decel);
  }
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

  if (state.velocity.w > 0) {
    state.velocity.w = 0;
  }

  applyLongitudinalGroundDecel(state, inputs, dt);

  return { weightOnWheels: true, groundAltFt };
}
