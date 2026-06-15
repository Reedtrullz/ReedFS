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
} from './effectiveAutoflightTruth';

export interface LateralGuidanceTarget {
  mode: Extract<LateralMode, 'HDG_SEL' | 'LNAV'>;
  targetHeadingRad: number;
}

export interface VerticalGuidanceTarget {
  mode: Extract<VerticalMode, 'ALT_HOLD' | 'VS' | 'VNAV' | 'VNAV_PTH' | 'ALT*'>;
  targetAltitudeFt?: number;
  targetVerticalSpeedFpm?: number;
}

export interface ThrustGuidanceTarget {
  mode: Extract<ThrustMode, 'SPEED' | 'N1'>;
  targetSpeedKt?: number;
  targetN1Percent?: number;
}

export interface SharedGuidanceTargets {
  truth: AutoflightTruthState;
  lateral: LateralGuidanceTarget | null;
  vertical: VerticalGuidanceTarget | null;
  thrust: ThrustGuidanceTarget | null;
}

export interface FlightDirectorLateralGuidanceTarget {
  mode: 'HDG_SEL';
  targetHeadingRad: number;
}

export interface FlightDirectorVerticalGuidanceTarget {
  mode: 'ALT_HOLD';
  targetAltitudeFt: number;
}

export interface FlightDirectorGuidanceTargets {
  lateral: FlightDirectorLateralGuidanceTarget | null;
  vertical: FlightDirectorVerticalGuidanceTarget | null;
}

export function resolveFlightDirectorGuidanceTargets(targets: SharedGuidanceTargets): FlightDirectorGuidanceTargets {
  const lateral: FlightDirectorLateralGuidanceTarget | null = targets.lateral?.mode === 'HDG_SEL' && Number.isFinite(targets.lateral.targetHeadingRad)
    ? { mode: 'HDG_SEL', targetHeadingRad: targets.lateral.targetHeadingRad }
    : null;
  const vertical: FlightDirectorVerticalGuidanceTarget | null = targets.vertical?.mode === 'ALT_HOLD' && Number.isFinite(targets.vertical.targetAltitudeFt)
    ? { mode: 'ALT_HOLD', targetAltitudeFt: targets.vertical.targetAltitudeFt as number }
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

function resolveLateralTarget(
  input: ResolveGuidanceTargetsInput,
  truth: AutoflightTruthState,
  nav: NavOutput | null,
): LateralGuidanceTarget | null {
  if (!autopilotStatusIsEngaged(truth)) return null;
  if (truth.lateralActive === 'HDG_SEL') {
    const selectedHeadingDeg = finiteOrUndefined(input.apState?.boeing.heading) ?? 0;
    return { mode: 'HDG_SEL', targetHeadingRad: selectedHeadingDeg * Math.PI / 180 };
  }
  if (truth.lateralActive === 'LNAV' && nav) {
    return { mode: 'LNAV', targetHeadingRad: nav.desiredTrack };
  }
  return null;
}

function resolveVerticalTarget(
  input: ResolveGuidanceTargetsInput,
  truth: AutoflightTruthState,
  nav: NavOutput | null,
): VerticalGuidanceTarget | null {
  if (!autopilotStatusIsEngaged(truth)) return null;
  if (truth.verticalActive === 'ALT_HOLD') {
    const managedCaptureAlt = managedCaptureAltitudeFt(truth);
    const selectedAltitude = finiteOrUndefined(input.apState?.boeing.altitude);
    const targetAltitudeFt = managedCaptureAlt ?? (selectedAltitude !== undefined && selectedAltitude > 0 ? selectedAltitude : undefined);
    return targetAltitudeFt !== undefined ? { mode: 'ALT_HOLD', targetAltitudeFt } : null;
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
  if ((truth.verticalActive === 'VNAV' || truth.verticalActive === 'VNAV_PTH' || truth.verticalActive === 'ALT*') && input.flightPlan && nav) {
    const vnav = computeVNAV(input.aircraft, input.flightPlan, nav);
    if (!vnav.available || !vnav.altitudeConstraint || vnav.verticalMode === 'VNAV') return null;
    return {
      mode: truth.verticalActive,
      targetAltitudeFt: vnav.targetAlt,
      targetVerticalSpeedFpm: vnav.targetVs,
    };
  }
  return null;
}

function resolveThrustTarget(
  input: ResolveGuidanceTargetsInput,
  truth: AutoflightTruthState,
  nav: NavOutput | null,
): ThrustGuidanceTarget | null {
  if (truth.thrustActive === 'SPEED') {
    const selectedSpeed = finiteOrUndefined(input.apState?.boeing.speed);
    let routeManagedSpeed = managedSpeedKt(truth);
    if (routeManagedSpeed === undefined
      && selectedSpeed === undefined
      && input.flightPlan
      && nav
      && (truth.verticalActive === 'VNAV' || truth.verticalActive === 'VNAV_PTH' || truth.verticalActive === 'ALT*')) {
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

  return {
    truth,
    lateral: resolveLateralTarget(input, truth, nav),
    vertical: resolveVerticalTarget(input, truth, nav),
    thrust: resolveThrustTarget(input, truth, nav),
  };
}
