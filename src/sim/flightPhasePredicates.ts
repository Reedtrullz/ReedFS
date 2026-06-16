import type { AircraftState, FlightPhase } from './types';
import type { RouteStatusSnapshot } from './systems/navigation';
import { bodyToNed } from './physics/frames';

const MIN_POSITIVE_RATE_AGL_FT = 10;
const MIN_UPWARD_NED_DOWN_MPS = -0.25;
const DESCENT_MIN_ALTITUDE_DELTA_FT = 750;
const DESCENT_ROUTE_WINDOW_NM = 80;
const APPROACH_MAX_AGL_FT = 5_000;
const APPROACH_MIN_FLAP_DEG = 25;

export interface RouteDrivenFlightPhaseContext {
  routeStatus: Pick<
    RouteStatusSnapshot,
    'routeValid' | 'routeComplete' | 'lnavAvailable' | 'approachHandoff' | 'distanceToNextNm' | 'activeLegIndex' | 'activeLegCount'
  > | null;
  descentTargetAltitudeFt?: number | null;
  selectedVerticalSpeedFpm?: number | null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isAirborne(state: AircraftState): boolean {
  return !state.ground.weightOnWheels && state.ground.contact !== 'gear';
}

function routeHasUsableLifecycleContext(context: RouteDrivenFlightPhaseContext): boolean {
  const routeStatus = context.routeStatus;
  return Boolean(routeStatus?.routeValid && !routeStatus.routeComplete && routeStatus.lnavAvailable);
}

function isInDescentWindow(routeStatus: RouteDrivenFlightPhaseContext['routeStatus']): boolean {
  if (!routeStatus) return false;
  if (routeStatus.approachHandoff === 'final' || routeStatus.approachHandoff === 'threshold') return true;
  const distanceToNextNm = finiteNumber(routeStatus.distanceToNextNm);
  return distanceToNextNm !== null && distanceToNextNm <= DESCENT_ROUTE_WINDOW_NM;
}

function shouldEnterDescentPhase(state: AircraftState, context: RouteDrivenFlightPhaseContext): boolean {
  if ((state.flightPhase !== 'CLIMB' && state.flightPhase !== 'CRUISE') || !isAirborne(state)) return false;
  if (!routeHasUsableLifecycleContext(context) || !isInDescentWindow(context.routeStatus)) return false;
  const selectedVerticalSpeedFpm = finiteNumber(context.selectedVerticalSpeedFpm);
  if (selectedVerticalSpeedFpm !== null && selectedVerticalSpeedFpm < -100) return true;
  const descentTargetAltitudeFt = finiteNumber(context.descentTargetAltitudeFt);
  return descentTargetAltitudeFt !== null && state.position.alt - descentTargetAltitudeFt >= DESCENT_MIN_ALTITUDE_DELTA_FT;
}

function isConfiguredForApproach(state: AircraftState): boolean {
  return state.config.gearDown && state.config.gearPosition >= 0.95 && state.config.flapSetting >= APPROACH_MIN_FLAP_DEG;
}

function shouldEnterApproachPhase(state: AircraftState, context: RouteDrivenFlightPhaseContext): boolean {
  const routeStatus = context.routeStatus;
  if (state.flightPhase !== 'DESCENT' || !isAirborne(state) || !routeHasUsableLifecycleContext(context) || !routeStatus) return false;
  if (routeStatus.approachHandoff !== 'final' && routeStatus.approachHandoff !== 'threshold') return false;
  return state.ground.aglFt <= APPROACH_MAX_AGL_FT && isConfiguredForApproach(state);
}

function shouldEnterManualConfiguredApproachPhase(state: AircraftState, context: RouteDrivenFlightPhaseContext): boolean {
  if (state.flightPhase !== 'DESCENT' || !isAirborne(state)) return false;
  if (routeHasUsableLifecycleContext(context)) return false;
  return state.ground.aglFt <= APPROACH_MAX_AGL_FT && isConfiguredForApproach(state);
}

export function deriveRouteDrivenFlightPhase(
  state: AircraftState,
  context: RouteDrivenFlightPhaseContext,
): FlightPhase {
  if (shouldEnterApproachPhase(state, context)) return 'APPROACH';
  if (shouldEnterManualConfiguredApproachPhase(state, context)) return 'APPROACH';
  if (shouldEnterDescentPhase(state, context)) return 'DESCENT';
  return state.flightPhase;
}

export function isPositiveRateEstablished(state: AircraftState): boolean {
  return !state.ground.weightOnWheels
    && state.ground.aglFt > MIN_POSITIVE_RATE_AGL_FT
    && bodyToNed(state.velocity, state.attitude).down < MIN_UPWARD_NED_DOWN_MPS;
}
