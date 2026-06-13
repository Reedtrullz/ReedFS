import type { AircraftState } from '../types';
import type { AltitudeConstraint, FlightPlan, FlightPlanWaypoint, SpeedConstraint } from '@shared/types/fmc';
import type { VerticalMode } from '@shared/autopilot/autopilotTypes';
import type { NavOutput } from './navigation';

const M_PER_NM = 1852;
const EARTH_RADIUS_M = 6371000;
const MAX_VNAV_VS_FPM = 3000;
const VNAV_ALT_HOLD_CAPTURE_FT = 50;
const VNAV_ALT_ACQUIRE_FT = 250;
const VNAV_DESCENT_PATH_FT_PER_NM = 318;
const VNAV_TOD_CAPTURE_TOLERANCE_NM = 1;

export type VnavAltitudeTargetSource = 'VNAV_CONSTRAINT';
export type VnavLifecycle = 'UNAVAILABLE' | 'ARMED' | 'PATH' | 'ALT_CAPTURE' | 'ALT_HOLD' | 'COMPLETE';

export interface VnavOutput {
  targetAlt: number;
  targetVs: number;
  altitudeConstraint: boolean;
  targetAltitudeSource?: VnavAltitudeTargetSource;
  captureTargetAltFt?: number;
  /** Honest vertical mode implied by the current VNAV path lifecycle. */
  verticalMode: VerticalMode | null;
  /** True only when the active/future route waypoint has an actionable VNAV altitude and/or speed target. */
  available: boolean;
  unavailableReason: string | null;
  speedConstraint: boolean;
  targetSpeedKt?: number;
  /** Explicit VNAV path lifecycle independent of raw RFMS vertical-mode labels. */
  lifecycle: VnavLifecycle;
  targetWaypointIndex?: number;
  targetWaypointIdent?: string;
  distanceToConstraintNm?: number;
  todDistanceNm?: number;
  distanceToTodNm?: number;
}

interface VnavTargetWaypoint {
  waypoint: FlightPlanWaypoint;
  index: number;
  distanceM: number;
  altitudeTarget?: number;
  speedTarget?: number;
}

function finiteNumber(value: number | undefined | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

function distanceM(from: FlightPlanWaypoint, to: FlightPlanWaypoint): number | null {
  const fromLat = finiteNumber(from.lat);
  const fromLon = finiteNumber(from.lon);
  const toLat = finiteNumber(to.lat);
  const toLon = finiteNumber(to.lon);
  if (fromLat === undefined || fromLon === undefined || toLat === undefined || toLon === undefined) return null;

  const meanLat = toRad((fromLat + toLat) / 2);
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const x = dLon * Math.cos(meanLat);
  const y = dLat;
  return Math.hypot(x, y) * EARTH_RADIUS_M;
}

function unavailable(state: AircraftState, reason: string, lifecycle: VnavLifecycle = 'UNAVAILABLE'): VnavOutput {
  return {
    targetAlt: state.position.alt,
    targetVs: 0,
    altitudeConstraint: false,
    verticalMode: null,
    available: false,
    unavailableReason: reason,
    speedConstraint: false,
    lifecycle,
  };
}

function activeWaypointIndexFor(flightPlan: FlightPlan, nav: NavOutput): number | null {
  const index = Math.trunc(nav.activeWaypointIndex);
  if (!Number.isFinite(index) || index < 0) return null;
  return flightPlan.waypoints[index] ? index : null;
}

function resolveAltitudeTarget(currentAltFt: number, constraint: AltitudeConstraint | undefined): number | undefined {
  if (!constraint) return undefined;
  const altitude = finiteNumber(constraint.altitude);
  if (altitude === undefined) return undefined;

  if (constraint.type === 'AT') return altitude;
  if (constraint.type === 'AT_OR_ABOVE') return currentAltFt < altitude ? altitude : undefined;
  if (constraint.type === 'AT_OR_BELOW') return currentAltFt > altitude ? altitude : undefined;

  const altitude2 = finiteNumber(constraint.altitude2);
  if (altitude2 === undefined) return undefined;
  const lower = Math.min(altitude, altitude2);
  const upper = Math.max(altitude, altitude2);
  if (currentAltFt < lower) return lower;
  if (currentAltFt > upper) return upper;
  return undefined;
}

function resolveSpeedTarget(constraint: SpeedConstraint | undefined): number | undefined {
  const speed = finiteNumber(constraint?.speed);
  return speed !== undefined && speed > 0 ? speed : undefined;
}

function distanceToWaypointM(flightPlan: FlightPlan, nav: NavOutput, targetIndex: number): number | null {
  const activeIndex = activeWaypointIndexFor(flightPlan, nav);
  if (activeIndex === null || targetIndex < activeIndex) return null;

  let totalM = Math.max(0, nav.alongTrackDist);
  for (let index = activeIndex + 1; index <= targetIndex; index += 1) {
    const legDistanceM = distanceM(flightPlan.waypoints[index - 1], flightPlan.waypoints[index]);
    if (legDistanceM === null) return null;
    totalM += legDistanceM;
  }
  return totalM;
}

function findVnavTarget(state: AircraftState, flightPlan: FlightPlan, nav: NavOutput): VnavTargetWaypoint | null {
  const activeIndex = activeWaypointIndexFor(flightPlan, nav);
  if (activeIndex === null) return null;

  for (let index = activeIndex; index < flightPlan.waypoints.length; index += 1) {
    const waypoint = flightPlan.waypoints[index];
    if (waypoint.discontinuity) return null;

    const altitudeTarget = resolveAltitudeTarget(state.position.alt, waypoint.altitudeConstraint);
    const speedTarget = resolveSpeedTarget(waypoint.speedConstraint);
    if (altitudeTarget === undefined && speedTarget === undefined) continue;

    const distanceToTargetM = distanceToWaypointM(flightPlan, nav, index);
    if (distanceToTargetM === null) return null;
    return { waypoint, index, distanceM: distanceToTargetM, altitudeTarget, speedTarget };
  }
  return null;
}

function requiredVerticalSpeedFpm(state: AircraftState, targetAltFt: number, distanceToConstraintM: number): number {
  const distNm = Math.max(0, distanceToConstraintM / M_PER_NM);
  const tasKt = Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w) * 1.944;
  const timeSec = tasKt > 50 && distNm > 0.05 ? (distNm / tasKt) * 3600 : 999;
  const rawVs = timeSec > 0 ? ((targetAltFt - state.position.alt) / timeSec) * 60 : 0;
  return clamp(rawVs, -MAX_VNAV_VS_FPM, MAX_VNAV_VS_FPM);
}

function lifecycleForAltitudeTarget(state: AircraftState, targetAltFt: number, distanceToConstraintNm: number): {
  lifecycle: VnavLifecycle;
  verticalMode: VerticalMode;
  todDistanceNm: number;
  distanceToTodNm: number;
} {
  const altitudeDeltaFt = targetAltFt - state.position.alt;
  const altitudeErrorFt = Math.abs(altitudeDeltaFt);
  const todDistanceNm = altitudeDeltaFt < 0 ? altitudeErrorFt / VNAV_DESCENT_PATH_FT_PER_NM : 0;
  const distanceToTodNm = altitudeDeltaFt < 0 ? distanceToConstraintNm - todDistanceNm : 0;

  if (altitudeErrorFt <= VNAV_ALT_HOLD_CAPTURE_FT) {
    return { lifecycle: 'ALT_HOLD', verticalMode: 'ALT_HOLD', todDistanceNm, distanceToTodNm };
  }
  if (altitudeErrorFt <= VNAV_ALT_ACQUIRE_FT) {
    return { lifecycle: 'ALT_CAPTURE', verticalMode: 'ALT*', todDistanceNm, distanceToTodNm };
  }
  if (altitudeDeltaFt < 0 && distanceToTodNm > VNAV_TOD_CAPTURE_TOLERANCE_NM) {
    return { lifecycle: 'ARMED', verticalMode: 'VNAV', todDistanceNm, distanceToTodNm };
  }
  return { lifecycle: 'PATH', verticalMode: 'VNAV_PTH', todDistanceNm, distanceToTodNm };
}

export function computeVNAV(
  state: AircraftState,
  flightPlan: FlightPlan | null,
  nav: NavOutput,
): VnavOutput {
  if (!flightPlan) return unavailable(state, 'no flight plan loaded');
  if (flightPlan.waypoints.length === 0) return unavailable(state, 'flight plan has no waypoints');

  const activeIndex = activeWaypointIndexFor(flightPlan, nav);
  if (activeIndex === null) return unavailable(state, 'active route waypoint is not valid for VNAV');
  const activeWaypoint = flightPlan.waypoints[activeIndex];
  if (!activeWaypoint || activeWaypoint.discontinuity) return unavailable(state, 'active route waypoint is not valid for VNAV');
  if (nav.waypointReached && activeIndex >= flightPlan.waypoints.length - 1) {
    return unavailable(state, 'route complete', 'COMPLETE');
  }

  const target = findVnavTarget(state, flightPlan, nav);
  if (!target) return unavailable(state, 'active or remaining route has no actionable VNAV altitude or speed constraint');

  const hasAltitudeTarget = target.altitudeTarget !== undefined;
  const hasSpeedTarget = target.speedTarget !== undefined;
  const distanceToConstraintNm = Math.max(0, target.distanceM / M_PER_NM);
  const altitudeLifecycle = hasAltitudeTarget
    ? lifecycleForAltitudeTarget(state, target.altitudeTarget as number, distanceToConstraintNm)
    : { lifecycle: 'ARMED' as VnavLifecycle, verticalMode: 'VNAV' as VerticalMode, todDistanceNm: 0, distanceToTodNm: 0 };
  const targetVs = hasAltitudeTarget && altitudeLifecycle.lifecycle !== 'ARMED'
    ? requiredVerticalSpeedFpm(state, target.altitudeTarget as number, target.distanceM)
    : 0;

  return {
    targetAlt: target.altitudeTarget ?? state.position.alt,
    targetVs,
    altitudeConstraint: hasAltitudeTarget,
    targetAltitudeSource: hasAltitudeTarget ? 'VNAV_CONSTRAINT' : undefined,
    captureTargetAltFt: target.altitudeTarget,
    verticalMode: altitudeLifecycle.verticalMode,
    available: true,
    unavailableReason: null,
    speedConstraint: hasSpeedTarget,
    targetSpeedKt: target.speedTarget,
    lifecycle: altitudeLifecycle.lifecycle,
    targetWaypointIndex: target.index,
    targetWaypointIdent: target.waypoint.ident,
    distanceToConstraintNm,
    todDistanceNm: hasAltitudeTarget ? altitudeLifecycle.todDistanceNm : undefined,
    distanceToTodNm: hasAltitudeTarget ? altitudeLifecycle.distanceToTodNm : undefined,
  };
}
