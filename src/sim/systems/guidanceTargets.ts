import type {
  AutoflightTruthState,
  AutopilotState,
  LateralMode,
  ThrustMode,
  VerticalMode,
} from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { AircraftState } from '../types';
import type { WindInfo } from '../weather';
import {
  computeRouteStatus,
  routeStatusToNavOutput,
  type NavOutput,
  type RouteStatusSnapshot,
} from './navigation';
import { computeVNAV } from './vnav';
import {
  deriveEffectiveAutoflightTruth,
  offAutoflightTruth,
  type ManagedAltitudeCaptureTruth,
  resolveSyntheticApproachProfile,
  type SyntheticApproachProfile,
} from './effectiveAutoflightTruth';

export interface LateralGuidanceTarget {
  mode: Extract<LateralMode, 'HDG_SEL' | 'LNAV' | 'APP'>;
  targetHeadingRad: number;
}

export interface VerticalGuidanceTarget {
  mode: Extract<VerticalMode, 'ALT_HOLD' | 'VS' | 'VNAV' | 'VNAV_PTH' | 'ALT*' | 'G_S'>;
  targetAltitudeFt?: number;
  targetVerticalSpeedFpm?: number;
  targetPitchDeg?: number;
}

export interface ThrustGuidanceTarget {
  mode: Extract<ThrustMode, 'SPEED' | 'N1' | 'RETARD'>;
  targetSpeedKt?: number;
  targetN1Percent?: number;
  targetThrottle?: number;
}

export interface SharedGuidanceTargets {
  truth: AutoflightTruthState;
  lateral: LateralGuidanceTarget | null;
  vertical: VerticalGuidanceTarget | null;
  thrust: ThrustGuidanceTarget | null;
}

export interface FlightDirectorLateralGuidanceTarget {
  mode: 'HDG_SEL' | 'APP';
  targetHeadingRad: number;
}

export interface FlightDirectorVerticalGuidanceTarget {
  mode: 'ALT_HOLD' | 'G_S';
  targetAltitudeFt?: number;
  targetPitchDeg?: number;
}

export interface FlightDirectorGuidanceTargets {
  lateral: FlightDirectorLateralGuidanceTarget | null;
  vertical: FlightDirectorVerticalGuidanceTarget | null;
}

export function resolveFlightDirectorGuidanceTargets(targets: SharedGuidanceTargets): FlightDirectorGuidanceTargets {
  const lateral: FlightDirectorLateralGuidanceTarget | null = (targets.lateral?.mode === 'HDG_SEL' || targets.lateral?.mode === 'APP') && Number.isFinite(targets.lateral.targetHeadingRad)
    ? { mode: targets.lateral.mode, targetHeadingRad: targets.lateral.targetHeadingRad }
    : null;
  const vertical: FlightDirectorVerticalGuidanceTarget | null = targets.vertical?.mode === 'ALT_HOLD' && Number.isFinite(targets.vertical.targetAltitudeFt)
    ? { mode: 'ALT_HOLD', targetAltitudeFt: targets.vertical.targetAltitudeFt as number }
    : targets.vertical?.mode === 'G_S' && Number.isFinite(targets.vertical.targetPitchDeg)
      ? { mode: 'G_S', targetPitchDeg: targets.vertical.targetPitchDeg as number }
    : null;
  return { lateral, vertical };
}

export function hasFlightDirectorGuidanceTarget(targets: SharedGuidanceTargets): boolean {
  const fdTargets = resolveFlightDirectorGuidanceTargets(targets);
  return fdTargets.lateral !== null || fdTargets.vertical !== null;
}

export interface ResolveGuidanceTargetsInput {
  aircraft: AircraftState;
  apState: AutopilotState | null | undefined;
  flightPlan?: FlightPlan | null;
  activeLegIndex?: number | null;
  routeStatus?: RouteStatusSnapshot | null;
  truthOverride?: AutoflightTruthState | null;
  wind?: WindInfo | null;
}

function finiteOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const EARTH_RADIUS_M = 6371000;
const M_TO_FT = 3.280839895;
const MPS_TO_FPM = 196.850394;
const GLIDESLOPE_DEG = 3;
const GLIDESLOPE_RAD = GLIDESLOPE_DEG * Math.PI / 180;
const FLARE_RADIO_ALT_FT = 50;

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

function normalizeRad(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((rad % twoPi) + twoPi) % twoPi;
}

function distanceM(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const meanLat = toRad((fromLat + toLat) / 2);
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const x = dLon * Math.cos(meanLat);
  const y = dLat;
  return Math.hypot(x, y) * EARTH_RADIUS_M;
}

function bearingRad(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const meanLat = toRad((fromLat + toLat) / 2);
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  return normalizeRad(Math.atan2(dLon * Math.cos(meanLat), dLat));
}

function horizontalSpeedMps(aircraft: AircraftState): number {
  return Math.hypot(aircraft.velocity.u, aircraft.velocity.v);
}

function syntheticGlidepathTarget(
  aircraft: AircraftState,
  profile: SyntheticApproachProfile,
): Pick<VerticalGuidanceTarget, 'targetAltitudeFt' | 'targetVerticalSpeedFpm' | 'targetPitchDeg'> {
  const radioAltitudeFt = finiteOrUndefined(aircraft.ground?.aglFt);
  if (radioAltitudeFt !== undefined && radioAltitudeFt <= FLARE_RADIO_ALT_FT) {
    const flareProgress = 1 - clamp(radioAltitudeFt / FLARE_RADIO_ALT_FT, 0, 1);
    return {
      targetAltitudeFt: profile.threshold.altitudeFt,
      targetPitchDeg: 2.5 + flareProgress * 2,
      targetVerticalSpeedFpm: -250,
    };
  }

  const distanceToThresholdM = distanceM(
    aircraft.position.lat,
    aircraft.position.lon,
    profile.threshold.lat,
    profile.threshold.lon,
  );
  const pathAltitudeFt = profile.threshold.altitudeFt + distanceToThresholdM * M_TO_FT * Math.tan(GLIDESLOPE_RAD);
  const basePathVsFpm = -horizontalSpeedMps(aircraft) * MPS_TO_FPM * Math.tan(GLIDESLOPE_RAD);
  const pathErrorFt = pathAltitudeFt - aircraft.position.alt;
  return {
    targetAltitudeFt: pathAltitudeFt,
    targetVerticalSpeedFpm: clamp(basePathVsFpm + clamp(pathErrorFt * 3, -900, 900), -1_600, 300),
  };
}

function autopilotStatusIsEngaged(truth: AutoflightTruthState): boolean {
  return truth.autopilotStatus !== 'OFF';
}

function managedCaptureAltitudeFt(truth: AutoflightTruthState): number | undefined {
  const managedTruth = truth as ManagedAltitudeCaptureTruth;
  if (managedTruth.targetAltitudeSource !== 'VNAV_CONSTRAINT') return undefined;
  const captureTarget = finiteOrUndefined(managedTruth.captureTargetAltFt);
  return captureTarget !== undefined && captureTarget > 0 ? captureTarget : undefined;
}

function managedSpeedKt(truth: AutoflightTruthState): number | undefined {
  const managedTruth = truth as ManagedAltitudeCaptureTruth;
  if (managedTruth.managedSpeedSource !== 'VNAV_SPEED_CONSTRAINT') return undefined;
  return finiteOrUndefined(managedTruth.managedSpeedKt);
}

function routeStatusForInput(input: ResolveGuidanceTargetsInput): RouteStatusSnapshot | null {
  if (input.routeStatus) return input.routeStatus;
  if (!input.flightPlan) return null;
  if (input.activeLegIndex === undefined || input.activeLegIndex === null) return null;
  if (typeof input.activeLegIndex !== 'number' || !Number.isFinite(input.activeLegIndex) || input.activeLegIndex < 0) return null;
  const maxActiveLegIndex = input.flightPlan.waypoints.length - 2;
  if (maxActiveLegIndex < 0 || input.activeLegIndex > maxActiveLegIndex) return null;
  return computeRouteStatus(input.aircraft, input.flightPlan, input.activeLegIndex);
}

function navOutputFor(routeStatus: RouteStatusSnapshot | null): NavOutput | null {
  if (!routeStatus) return null;
  return routeStatusToNavOutput(routeStatus, { maxInterceptDeg: 25 });
}

export function computeN1TargetPercent(state: AircraftState): number {
  if (state.flightPhase === 'TAKEOFF') return 92;
  if (state.flightPhase === 'CLIMB') return 88;
  if (state.flightPhase === 'CRUISE' || state.position.alt > 18_000) return 72;
  if (state.flightPhase === 'DESCENT' || state.flightPhase === 'APPROACH' || state.flightPhase === 'LANDED') return 55;
  return 20;
}

function verticalSpeedTargetWithAltitudeCapture(
  targetVerticalSpeedFpm: number,
  selectedAltitudeFt: number | undefined,
  altitudeFt: number,
): number {
  if (selectedAltitudeFt === undefined || selectedAltitudeFt <= 0) return targetVerticalSpeedFpm;

  const altitudeDeltaFt = selectedAltitudeFt - altitudeFt;
  const captureWindowFt = 500;
  const enteringCaptureWindow = Math.abs(altitudeDeltaFt) < captureWindowFt * 2
    && ((targetVerticalSpeedFpm > 0 && altitudeDeltaFt <= captureWindowFt)
      || (targetVerticalSpeedFpm < 0 && altitudeDeltaFt >= -captureWindowFt));
  if (!enteringCaptureWindow) return targetVerticalSpeedFpm;

  return targetVerticalSpeedFpm * Math.max(0, Math.abs(altitudeDeltaFt) / captureWindowFt);
}

function altitudeCaptureVerticalSpeedTarget(targetAltitudeFt: number, altitudeFt: number): number {
  const altitudeDeltaFt = targetAltitudeFt - altitudeFt;
  if (Math.abs(altitudeDeltaFt) <= 80) return 0;
  return clamp(altitudeDeltaFt * 4, -1800, 1800);
}

function resolveLateralTarget(
  input: ResolveGuidanceTargetsInput,
  truth: AutoflightTruthState,
  nav: NavOutput | null,
  approachProfile: SyntheticApproachProfile | null,
): LateralGuidanceTarget | null {
  if (!autopilotStatusIsEngaged(truth)) return null;
  if (truth.lateralActive === 'HDG_SEL') {
    const selectedHeadingDeg = finiteOrUndefined(input.apState?.boeing.heading) ?? 0;
    return { mode: 'HDG_SEL', targetHeadingRad: selectedHeadingDeg * Math.PI / 180 };
  }
  if (truth.lateralActive === 'LNAV' && nav) {
    return { mode: 'LNAV', targetHeadingRad: nav.desiredTrack };
  }
  if (truth.lateralActive === 'APP' && approachProfile) {
    return {
      mode: 'APP',
      targetHeadingRad: nav?.desiredTrack ?? bearingRad(
        input.aircraft.position.lat,
        input.aircraft.position.lon,
        approachProfile.threshold.lat,
        approachProfile.threshold.lon,
      ),
    };
  }
  return null;
}

function resolveVerticalTarget(
  input: ResolveGuidanceTargetsInput,
  truth: AutoflightTruthState,
  nav: NavOutput | null,
  approachProfile: SyntheticApproachProfile | null,
): VerticalGuidanceTarget | null {
  if (!autopilotStatusIsEngaged(truth)) return null;
  if (truth.verticalActive === 'ALT_HOLD') {
    const managedCaptureAlt = managedCaptureAltitudeFt(truth);
    const selectedAltitude = finiteOrUndefined(input.apState?.boeing.altitude);
    const targetAltitudeFt = managedCaptureAlt ?? (selectedAltitude !== undefined && selectedAltitude > 0 ? selectedAltitude : undefined);
    return targetAltitudeFt !== undefined ? { mode: 'ALT_HOLD', targetAltitudeFt } : null;
  }
  if (truth.verticalActive === 'ALT*') {
    const managedCaptureAlt = managedCaptureAltitudeFt(truth);
    const selectedAltitude = finiteOrUndefined(input.apState?.boeing.altitude);
    const targetAltitudeFt = managedCaptureAlt ?? (selectedAltitude !== undefined && selectedAltitude > 0 ? selectedAltitude : undefined);
    return targetAltitudeFt !== undefined
      ? {
        mode: 'ALT*',
        targetAltitudeFt,
        targetVerticalSpeedFpm: altitudeCaptureVerticalSpeedTarget(targetAltitudeFt, input.aircraft.position.alt),
      }
      : null;
  }
  if (truth.verticalActive === 'VS') {
    const rawVerticalSpeedFpm = finiteOrUndefined(input.apState?.boeing.verticalSpeed) ?? 0;
    const selectedAltitude = finiteOrUndefined(input.apState?.boeing.altitude);
    return {
      mode: 'VS',
      targetVerticalSpeedFpm: verticalSpeedTargetWithAltitudeCapture(rawVerticalSpeedFpm, selectedAltitude, input.aircraft.position.alt),
      targetAltitudeFt: selectedAltitude !== undefined && selectedAltitude > 0 ? selectedAltitude : undefined,
    };
  }
  if ((truth.verticalActive === 'VNAV' || truth.verticalActive === 'VNAV_PTH') && input.flightPlan && nav) {
    const vnav = computeVNAV(input.aircraft, input.flightPlan, nav);
    const verticalMode = vnav.verticalMode;
    if (!vnav.available || !vnav.altitudeConstraint || !verticalMode || verticalMode === 'VNAV') return null;
    if (verticalMode !== 'VNAV_PTH' && verticalMode !== 'ALT*' && verticalMode !== 'ALT_HOLD') return null;
    return {
      mode: verticalMode,
      targetAltitudeFt: vnav.targetAlt,
      targetVerticalSpeedFpm: vnav.targetVs,
    };
  }
  if (truth.verticalActive === 'G_S' && approachProfile) {
    return {
      mode: 'G_S',
      ...syntheticGlidepathTarget(input.aircraft, approachProfile),
    };
  }
  return null;
}

function resolveThrustTarget(
  input: ResolveGuidanceTargetsInput,
  truth: AutoflightTruthState,
  nav: NavOutput | null,
  approachProfile: SyntheticApproachProfile | null,
): ThrustGuidanceTarget | null {
  if (truth.thrustActive === 'RETARD') {
    return { mode: 'RETARD', targetThrottle: 0 };
  }
  if (truth.thrustActive === 'SPEED') {
    const selectedSpeed = finiteOrUndefined(input.apState?.boeing.speed);
    let routeManagedSpeed = managedSpeedKt(truth);
    if (routeManagedSpeed === undefined && selectedSpeed === undefined && truth.verticalActive === 'G_S' && approachProfile) {
      routeManagedSpeed = approachProfile.threshold.speedKt ?? approachProfile.finalApproachFix.speedKt;
    }
    if (routeManagedSpeed === undefined
      && selectedSpeed === undefined
      && input.flightPlan
      && nav
      && (truth.verticalActive === 'VNAV' || truth.verticalActive === 'VNAV_PTH')) {
      const vnav = computeVNAV(input.aircraft, input.flightPlan, nav);
      routeManagedSpeed = vnav.available && vnav.speedConstraint ? vnav.targetSpeedKt : undefined;
    }
    return {
      mode: 'SPEED',
      targetSpeedKt: selectedSpeed ?? routeManagedSpeed ?? 250,
    };
  }
  if (truth.thrustActive === 'N1' && input.apState?.boeing.autothrottleArm) {
    return { mode: 'N1', targetN1Percent: computeN1TargetPercent(input.aircraft) };
  }
  return null;
}

export function resolveGuidanceTargets(input: ResolveGuidanceTargetsInput): SharedGuidanceTargets {
  const routeStatus = routeStatusForInput(input);
  const truth = input.truthOverride ?? (input.apState
    ? deriveEffectiveAutoflightTruth(input.apState, {
      aircraft: input.aircraft,
      flightPlan: input.flightPlan ?? null,
      routeStatus,
    })
    : offAutoflightTruth(input.apState));
  const nav = navOutputFor(routeStatus);
  const approachProfile = resolveSyntheticApproachProfile({
    aircraft: input.aircraft,
    flightPlan: input.flightPlan ?? null,
    routeStatus,
  });

  return {
    truth,
    lateral: resolveLateralTarget(input, truth, nav, approachProfile),
    vertical: resolveVerticalTarget(input, truth, nav, approachProfile),
    thrust: resolveThrustTarget(input, truth, nav, approachProfile),
  };
}
