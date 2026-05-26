import type { AircraftState } from '../types';
import type { AltitudeConstraint, FlightPlan, FlightPlanWaypoint, SpeedConstraint } from '@shared/types/fmc';
import type { VerticalMode } from '@shared/autopilot/autopilotTypes';
import type { NavOutput } from './navigation';

const M_PER_NM = 1852;
const MAX_VNAV_VS_FPM = 3000;
const VNAV_ALT_HOLD_CAPTURE_FT = 50;
const VNAV_ALT_ACQUIRE_FT = 250;

export interface VnavOutput {
  targetAlt: number;
  targetVs: number;
  altitudeConstraint: boolean;
  /** Honest vertical mode implied by the current VNAV path lifecycle. */
  verticalMode: VerticalMode | null;
  /** True only when the active waypoint has an actionable VNAV altitude and/or speed target. */
  available: boolean;
  unavailableReason: string | null;
  speedConstraint: boolean;
  targetSpeedKt?: number;
}

function finiteNumber(value: number | undefined | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function unavailable(state: AircraftState, reason: string): VnavOutput {
  return {
    targetAlt: state.position.alt,
    targetVs: 0,
    altitudeConstraint: false,
    verticalMode: null,
    available: false,
    unavailableReason: reason,
    speedConstraint: false,
  };
}

function activeWaypointFor(flightPlan: FlightPlan, nav: NavOutput): FlightPlanWaypoint | null {
  const index = Math.trunc(nav.activeWaypointIndex);
  if (!Number.isFinite(index) || index < 0) return null;
  return flightPlan.waypoints[index] ?? null;
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

function requiredVerticalSpeedFpm(state: AircraftState, targetAltFt: number, nav: NavOutput): number {
  const distNm = Math.max(0, nav.alongTrackDist / M_PER_NM);
  const tasKt = Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w) * 1.944;
  const timeSec = tasKt > 50 && distNm > 0.05 ? (distNm / tasKt) * 3600 : 999;
  const rawVs = timeSec > 0 ? ((targetAltFt - state.position.alt) / timeSec) * 60 : 0;
  return clamp(rawVs, -MAX_VNAV_VS_FPM, MAX_VNAV_VS_FPM);
}

function resolveVnavVerticalMode(state: AircraftState, targetAltFt: number): VerticalMode {
  const altitudeErrorFt = Math.abs(targetAltFt - state.position.alt);
  if (altitudeErrorFt <= VNAV_ALT_HOLD_CAPTURE_FT) return 'ALT_HOLD';
  if (altitudeErrorFt <= VNAV_ALT_ACQUIRE_FT) return 'ALT*';
  return 'VNAV_PTH';
}

export function computeVNAV(
  state: AircraftState,
  flightPlan: FlightPlan | null,
  nav: NavOutput,
): VnavOutput {
  if (!flightPlan) return unavailable(state, 'no flight plan loaded');
  if (flightPlan.waypoints.length === 0) return unavailable(state, 'flight plan has no waypoints');

  const wpt = activeWaypointFor(flightPlan, nav);
  if (!wpt || wpt.discontinuity) return unavailable(state, 'active route waypoint is not valid for VNAV');

  const altitudeTarget = resolveAltitudeTarget(state.position.alt, wpt.altitudeConstraint);
  const speedTarget = resolveSpeedTarget(wpt.speedConstraint);
  const hasAltitudeTarget = altitudeTarget !== undefined;
  const hasSpeedTarget = speedTarget !== undefined;
  const verticalMode = hasAltitudeTarget ? resolveVnavVerticalMode(state, altitudeTarget) : 'VNAV';

  if (!hasAltitudeTarget && !hasSpeedTarget) {
    return unavailable(state, 'active waypoint has no actionable VNAV altitude or speed constraint');
  }

  return {
    targetAlt: altitudeTarget ?? state.position.alt,
    targetVs: hasAltitudeTarget ? requiredVerticalSpeedFpm(state, altitudeTarget, nav) : 0,
    altitudeConstraint: hasAltitudeTarget,
    verticalMode,
    available: true,
    unavailableReason: null,
    speedConstraint: hasSpeedTarget,
    targetSpeedKt: speedTarget,
  };
}
