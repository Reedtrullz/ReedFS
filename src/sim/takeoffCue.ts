import type { AircraftState } from './types';

export const ROTATE_SPEED_KT = 140;
export const POSITIVE_RATE_ALT_FT = 50;

export function takeoffCueText(state: AircraftState, iasKt: number): string | null {
  if (state.flightPhase === 'CLIMB') {
    return state.config.gearDown ? 'GEAR UP' : null;
  }

  if (state.flightPhase !== 'TAKEOFF') {
    return null;
  }

  const heightAboveRunwayFt = state.position.alt - state.ground.groundAltFt;

  if (!state.config.gearDown) {
    return null;
  }

  if (heightAboveRunwayFt >= POSITIVE_RATE_ALT_FT && state.config.gearDown) {
    return 'POSITIVE RATE — gear up';
  }

  if (iasKt >= ROTATE_SPEED_KT && state.config.gearDown) {
    return 'ROTATE — hold W';
  }

  return 'TAKEOFF ROLL';
}
