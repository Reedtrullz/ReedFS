import type { AircraftState } from './types';
import { maybeFindPerformanceCardForScenario } from './data/performance/b737PerformanceCards';
import { isPositiveRateEstablished } from './flightPhasePredicates';

export const ROTATE_SPEED_KT = 140;

export function rotateSpeedKtForScenario(scenarioId?: string | null): number {
  return maybeFindPerformanceCardForScenario(scenarioId)?.vSpeeds.vrKt ?? ROTATE_SPEED_KT;
}

export function takeoffCueText(state: AircraftState, iasKt: number, scenarioId?: string | null): string | null {
  if (state.flightPhase === 'CLIMB') {
    return state.config.gearDown && isPositiveRateEstablished(state) ? 'GEAR UP' : null;
  }

  if (state.flightPhase !== 'TAKEOFF') {
    return null;
  }

  if (!state.config.gearDown) {
    return null;
  }

  if (isPositiveRateEstablished(state)) {
    return 'POSITIVE RATE — gear up';
  }

  if (iasKt >= rotateSpeedKtForScenario(scenarioId)) {
    return 'ROTATE — hold W';
  }

  return 'TAKEOFF ROLL';
}
