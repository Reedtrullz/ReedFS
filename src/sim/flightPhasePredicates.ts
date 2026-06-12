import type { AircraftState } from './types';

const MIN_POSITIVE_RATE_AGL_FT = 10;
const MIN_UPWARD_BODY_W_MPS = -0.25;

export function isPositiveRateEstablished(state: AircraftState): boolean {
  return !state.ground.weightOnWheels
    && state.ground.aglFt > MIN_POSITIVE_RATE_AGL_FT
    && state.velocity.w < MIN_UPWARD_BODY_W_MPS;
}
