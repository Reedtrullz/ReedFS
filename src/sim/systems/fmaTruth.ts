import type {
  AutoflightTruthState,
  AutopilotState,
  LateralMode,
  ThrustMode,
  VerticalMode,
} from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { AircraftState } from '../types';
import type { NavOutput, RouteStatusSnapshot } from './navigation';
import { computeVNAV } from './vnav';

const VNAV_FAMILY = new Set<VerticalMode>(['VNAV', 'VNAV_PTH', 'ALT*']);

export interface FmaTruthContext {
  aircraft?: AircraftState | null;
  flightPlan?: FlightPlan | null;
  routeStatus?: RouteStatusSnapshot | null;
}

function offTruth(apState: AutopilotState | null | undefined): AutoflightTruthState {
  return {
    lateralActive: 'OFF',
    lateralArmed: undefined,
    verticalActive: 'OFF',
    verticalArmed: undefined,
    thrustActive: 'OFF',
    autopilotStatus: 'OFF',
    lastModeChangeTimestamps: apState?.truth.lastModeChangeTimestamps ?? { thrust: 0, lateral: 0, vertical: 0 },
    vsEntry: apState?.truth.vsEntry,
  };
}

function autopilotStatusIsBacked(ap: AutopilotState): boolean {
  switch (ap.truth.autopilotStatus) {
    case 'OFF':
      return false;
    case 'CMD_A':
      return ap.boeing.cmdA;
    case 'CMD_B':
      return ap.boeing.cmdB;
    case 'CMD_AB':
      return ap.boeing.cmdA && ap.boeing.cmdB;
    case 'CWS_A':
      return ap.boeing.cwsA;
    case 'CWS_B':
      return ap.boeing.cwsB;
    case 'AP1':
      return ap.airbus.ap1;
    case 'AP2':
      return ap.airbus.ap2;
    case 'AP1_AP2':
      return ap.airbus.ap1 && ap.airbus.ap2;
    default:
      return false;
  }
}

function deriveThrustMode(ap: AutopilotState): ThrustMode {
  if (!ap.boeing.autothrottleArm) return 'OFF';
  if (ap.truth.thrustActive === 'SPEED') return ap.boeing.speedMode ? 'SPEED' : 'OFF';
  if (ap.truth.thrustActive === 'N1') return ap.boeing.n1 ? 'N1' : 'OFF';
  return ap.truth.thrustActive;
}

function deriveLateralMode(ap: AutopilotState, routeStatus: RouteStatusSnapshot | null | undefined): LateralMode {
  if (ap.truth.lateralActive === 'HDG_SEL') return ap.boeing.hdgSel ? 'HDG_SEL' : 'OFF';
  if (ap.truth.lateralActive === 'LNAV') {
    return ap.boeing.lnav && routeStatus?.lnavAvailable ? 'LNAV' : 'OFF';
  }
  if (ap.truth.lateralActive === 'VOR_LOC') return ap.boeing.vorLoc ? 'VOR_LOC' : 'OFF';
  if (ap.truth.lateralActive === 'APP' || ap.truth.lateralActive === 'LOC') return ap.boeing.app ? ap.truth.lateralActive : 'OFF';
  return ap.truth.lateralActive;
}

function navOutputFromRouteStatus(routeStatus: RouteStatusSnapshot): NavOutput | null {
  if (!routeStatus.lnavAvailable || routeStatus.desiredTrackRad === null) return null;
  const activeWaypointIndex = routeStatus.toWaypointIndex ?? routeStatus.activeLegIndex;
  if (activeWaypointIndex === null || !Number.isFinite(activeWaypointIndex)) return null;

  return {
    crossTrackError: routeStatus.crossTrackErrorM ?? 0,
    alongTrackDist: routeStatus.distanceToNextM ?? routeStatus.alongTrackM ?? 0,
    desiredTrack: routeStatus.desiredTrackRad,
    activeWaypointIndex,
    waypointReached: routeStatus.waypointReached,
  };
}

function deriveVnavMode(
  ap: AutopilotState,
  context: FmaTruthContext,
): VerticalMode {
  if (!ap.boeing.vnav) return 'OFF';
  const aircraft = context.aircraft;
  const flightPlan = context.flightPlan;
  const routeStatus = context.routeStatus;
  if (!aircraft || !flightPlan || !routeStatus?.lnavAvailable) return 'OFF';
  const nav = navOutputFromRouteStatus(routeStatus);
  if (!nav) return 'OFF';
  const vnav = computeVNAV(aircraft, flightPlan, nav);
  return vnav.available && vnav.verticalMode ? vnav.verticalMode : 'OFF';
}

function deriveVerticalMode(ap: AutopilotState, context: FmaTruthContext): VerticalMode {
  if (ap.truth.verticalActive === 'ALT_HOLD') return ap.boeing.altHold ? 'ALT_HOLD' : 'OFF';
  if (ap.truth.verticalActive === 'VS') return ap.boeing.vs ? 'VS' : 'OFF';
  if (VNAV_FAMILY.has(ap.truth.verticalActive)) return deriveVnavMode(ap, context);
  if (ap.truth.verticalActive === 'LVL_CHG') return ap.boeing.lvlChg ? 'LVL_CHG' : 'OFF';
  if (ap.truth.verticalActive === 'G_S') return ap.boeing.app ? 'G_S' : 'OFF';
  return ap.truth.verticalActive;
}

export function deriveDisplayFmaTruth(
  apState: AutopilotState | null | undefined,
  context: FmaTruthContext = {},
): AutoflightTruthState {
  if (!apState) return offTruth(apState);

  const backedAp = autopilotStatusIsBacked(apState);
  const thrustActive = deriveThrustMode(apState);
  if (!backedAp) {
    return offTruth(apState);
  }

  return {
    ...apState.truth,
    autopilotStatus: apState.truth.autopilotStatus,
    thrustActive,
    lateralActive: deriveLateralMode(apState, context.routeStatus),
    verticalActive: deriveVerticalMode(apState, context),
  };
}
