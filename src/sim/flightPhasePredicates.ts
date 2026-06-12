import type { AircraftState } from './types';
import { bodyToNed } from './physics/frames';

const MIN_POSITIVE_RATE_AGL_FT = 10;
const MIN_UPWARD_NED_DOWN_MPS = -0.25;

export function isPositiveRateEstablished(state: AircraftState): boolean {
  return !state.ground.weightOnWheels
    && state.ground.aglFt > MIN_POSITIVE_RATE_AGL_FT
    && bodyToNed(state.velocity, state.attitude).down < MIN_UPWARD_NED_DOWN_MPS;
}
