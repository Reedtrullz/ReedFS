import type {
  AutoflightTruthState,
  AutopilotState,
  LateralMode,
  ThrustMode,
  VerticalMode,
} from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { AircraftState } from '../types';
import { routeStatusToNavOutput, type RouteStatusSnapshot } from './navigation';
import { computeVNAV } from './vnav';

const VNAV_FAMILY = new Set<VerticalMode>(['VNAV', 'VNAV_PTH', 'ALT*']);

export interface EffectiveAutoflightTruthContext {
  aircraft?: AircraftState | null;
  flightPlan?: FlightPlan | null;
  routeStatus?: RouteStatusSnapshot | null;
}

export function offAutoflightTruth(apState: AutopilotState | null | undefined): AutoflightTruthState {
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

export function effectiveAutopilotIsEngaged(
  apState: AutopilotState | null | undefined,
  context: EffectiveAutoflightTruthContext = {},
): boolean {
  return deriveEffectiveAutoflightTruth(apState, context).autopilotStatus !== 'OFF';
}

function deriveThrustMode(ap: AutopilotState): ThrustMode {
  if (!ap.boeing.autothrottleArm) return 'OFF';
  if (ap.truth.thrustActive === 'SPEED') return ap.boeing.speedMode ? 'SPEED' : 'OFF';
  if (ap.truth.thrustActive === 'N1') return ap.boeing.n1 ? 'N1' : 'OFF';
  return 'OFF';
}

function deriveLateralMode(ap: AutopilotState, routeStatus: RouteStatusSnapshot | null | undefined): LateralMode {
  if (ap.truth.lateralActive === 'HDG_SEL') return ap.boeing.hdgSel ? 'HDG_SEL' : 'OFF';
  if (ap.truth.lateralActive === 'LNAV') {
    return ap.boeing.lnav && routeStatus?.lnavAvailable ? 'LNAV' : 'OFF';
  }
  if (ap.truth.lateralActive === 'VOR_LOC') return ap.boeing.vorLoc ? 'VOR_LOC' : 'OFF';
  if (ap.truth.lateralActive === 'APP' || ap.truth.lateralActive === 'LOC') return ap.boeing.app ? ap.truth.lateralActive : 'OFF';
  return 'OFF';
}

function deriveVnavMode(
  ap: AutopilotState,
  context: EffectiveAutoflightTruthContext,
): VerticalMode {
  if (!ap.boeing.vnav) return 'OFF';
  const aircraft = context.aircraft;
  const flightPlan = context.flightPlan;
  const routeStatus = context.routeStatus;
  if (!aircraft || !flightPlan || !routeStatus?.lnavAvailable) return 'OFF';
  const nav = routeStatusToNavOutput(routeStatus);
  if (!nav) return 'OFF';
  const vnav = computeVNAV(aircraft, flightPlan, nav);
  return vnav.available && vnav.verticalMode ? vnav.verticalMode : 'OFF';
}

function deriveVerticalMode(ap: AutopilotState, context: EffectiveAutoflightTruthContext): VerticalMode {
  if (ap.truth.verticalActive === 'ALT_HOLD') return ap.boeing.altHold ? 'ALT_HOLD' : 'OFF';
  if (ap.truth.verticalActive === 'VS') return ap.boeing.vs ? 'VS' : 'OFF';
  if (VNAV_FAMILY.has(ap.truth.verticalActive)) return deriveVnavMode(ap, context);
  if (ap.truth.verticalActive === 'LVL_CHG') return ap.boeing.lvlChg ? 'LVL_CHG' : 'OFF';
  if (ap.truth.verticalActive === 'G_S') return ap.boeing.app ? 'G_S' : 'OFF';
  return 'OFF';
}

export function deriveEffectiveAutoflightTruth(
  apState: AutopilotState | null | undefined,
  context: EffectiveAutoflightTruthContext = {},
): AutoflightTruthState {
  if (!apState) return offAutoflightTruth(apState);

  const backedAp = autopilotStatusIsBacked(apState);
  const thrustActive = deriveThrustMode(apState);
  if (!backedAp) {
    return offAutoflightTruth(apState);
  }

  return {
    ...apState.truth,
    autopilotStatus: apState.truth.autopilotStatus,
    thrustActive,
    lateralActive: deriveLateralMode(apState, context.routeStatus),
    verticalActive: deriveVerticalMode(apState, context),
  };
}
