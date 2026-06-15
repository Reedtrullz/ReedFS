import type {
  AutoflightTruthState,
  AutopilotState,
  LateralMode,
  ThrustMode,
  VerticalMode,
} from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { AircraftState } from '../types';
import { bodyToNed } from '../physics/frames';
import { routeStatusToNavOutput, type RouteStatusSnapshot } from './navigation';
import { computeVNAV, type VnavOutput } from './vnav';

const VNAV_FAMILY = new Set<VerticalMode>(['VNAV', 'VNAV_PTH', 'ALT*']);
const ALT_HOLD_CAPTURE_MAX_ERROR_FT = 80;
const ALT_HOLD_CAPTURE_MAX_ABS_VS_FPM = 300;

export interface AltitudeHoldCaptureInput {
  altitudeErrorFt: number;
  verticalSpeedFpm: number;
}

export function isAltitudeHoldCaptured({ altitudeErrorFt, verticalSpeedFpm }: AltitudeHoldCaptureInput): boolean {
  return Number.isFinite(altitudeErrorFt)
    && Number.isFinite(verticalSpeedFpm)
    && Math.abs(altitudeErrorFt) <= ALT_HOLD_CAPTURE_MAX_ERROR_FT
    && Math.abs(verticalSpeedFpm) <= ALT_HOLD_CAPTURE_MAX_ABS_VS_FPM;
}

function currentVerticalSpeedFpm(aircraft: AircraftState): number {
  const partialAircraft = aircraft as Partial<AircraftState>;
  const velocity = partialAircraft.velocity;
  if (!velocity) return 0;
  const attitude = partialAircraft.attitude ?? { phi: 0, theta: 0, psi: 0 };
  const ned = bodyToNed(velocity, attitude);
  return -ned.down * 196.850394;
}

export type ManagedAltitudeCaptureTruth = AutoflightTruthState & {
  targetAltitudeSource?: VnavOutput['targetAltitudeSource'];
  captureTargetAltFt?: number;
  managedSpeedKt?: VnavOutput['managedSpeedKt'];
  managedSpeedSource?: VnavOutput['managedSpeedSource'];
  lateralOnly?: boolean;
};

function omitManagedAltitudeCaptureMetadata(truth: AutoflightTruthState): AutoflightTruthState {
  const baseTruth = { ...(truth as ManagedAltitudeCaptureTruth) };
  delete baseTruth.targetAltitudeSource;
  delete baseTruth.captureTargetAltFt;
  delete baseTruth.managedSpeedKt;
  delete baseTruth.managedSpeedSource;
  delete baseTruth.lateralOnly;
  return baseTruth;
}

function resolveVnavOutput(
  ap: AutopilotState,
  context: EffectiveAutoflightTruthContext,
): VnavOutput | null {
  if (!ap.boeing.vnav) return null;
  const aircraft = context.aircraft;
  const flightPlan = context.flightPlan;
  const routeStatus = context.routeStatus;
  if (!aircraft || !flightPlan || !routeStatus?.lnavAvailable) return null;
  const nav = routeStatusToNavOutput(routeStatus);
  if (!nav) return null;
  return computeVNAV(aircraft, flightPlan, nav);
}

function vnavManagedAltitudeCaptureMetadata(vnav: VnavOutput | null): Partial<ManagedAltitudeCaptureTruth> {
  if (!vnav?.available || !vnav.altitudeConstraint || vnav.targetAltitudeSource !== 'VNAV_CONSTRAINT') return {};
  return {
    targetAltitudeSource: vnav.targetAltitudeSource,
    captureTargetAltFt: vnav.captureTargetAltFt,
  };
}

function vnavManagedSpeedMetadata(vnav: VnavOutput | null): Partial<ManagedAltitudeCaptureTruth> {
  if (!vnav?.available || !vnav.speedConstraint || vnav.managedSpeedSource !== 'VNAV_SPEED_CONSTRAINT') return {};
  return {
    managedSpeedKt: vnav.managedSpeedKt,
    managedSpeedSource: vnav.managedSpeedSource,
  };
}

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

export function isAutoflightLateralOnly(truth: AutoflightTruthState): boolean {
  return Boolean((truth as ManagedAltitudeCaptureTruth).lateralOnly);
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

function deriveVnavMode(vnav: VnavOutput | null, aircraft: AircraftState | null | undefined): VerticalMode {
  if (!vnav?.available || !vnav.verticalMode) return 'OFF';
  if (vnav.verticalMode !== 'ALT_HOLD') return vnav.verticalMode;
  return altitudeHoldCaptureMode(aircraft, vnav.captureTargetAltFt ?? vnav.targetAlt);
}

function altitudeHoldCaptureMode(
  aircraft: AircraftState | null | undefined,
  targetAltitudeFt: number | null | undefined,
): VerticalMode {
  if (!aircraft) return 'ALT*';
  if (typeof targetAltitudeFt !== 'number' || !Number.isFinite(targetAltitudeFt)) return 'ALT*';
  return isAltitudeHoldCaptured({
    altitudeErrorFt: targetAltitudeFt - aircraft.position.alt,
    verticalSpeedFpm: currentVerticalSpeedFpm(aircraft),
  }) ? 'ALT_HOLD' : 'ALT*';
}

function deriveVerticalMode(
  ap: AutopilotState,
  vnav: VnavOutput | null,
  aircraft: AircraftState | null | undefined,
): VerticalMode {
  if (ap.truth.verticalActive === 'ALT_HOLD') {
    return ap.boeing.altHold ? altitudeHoldCaptureMode(aircraft, ap.boeing.altitude) : 'OFF';
  }
  if (ap.truth.verticalActive === 'VS') return ap.boeing.vs ? 'VS' : 'OFF';
  if (VNAV_FAMILY.has(ap.truth.verticalActive)) return deriveVnavMode(vnav, aircraft);
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
    return {
      ...offAutoflightTruth(apState),
      thrustActive,
    };
  }

  const vnav = VNAV_FAMILY.has(apState.truth.verticalActive) ? resolveVnavOutput(apState, context) : null;
  const verticalActive = deriveVerticalMode(apState, vnav, context.aircraft);
  const lateralActive = deriveLateralMode(apState, context.routeStatus);
  const lateralOnly = lateralActive !== 'OFF' && verticalActive === 'OFF';
  const baseTruth = omitManagedAltitudeCaptureMetadata(apState.truth);

  return {
    ...baseTruth,
    autopilotStatus: apState.truth.autopilotStatus,
    thrustActive,
    lateralActive,
    verticalActive,
    ...(lateralOnly ? { lateralOnly: true } : {}),
    ...vnavManagedAltitudeCaptureMetadata(vnav),
    ...vnavManagedSpeedMetadata(vnav),
  };
}
