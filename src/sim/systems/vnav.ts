import type { AircraftState } from '../types';
import type { FlightPlan } from '@shared/types/fmc';
import type { NavOutput } from './navigation';

export interface VnavOutput {
  targetAlt: number;
  targetVs: number;
  altitudeConstraint: boolean;
}

export function computeVNAV(
  state: AircraftState,
  flightPlan: FlightPlan | null,
  nav: NavOutput,
): VnavOutput {
  const def: VnavOutput = { targetAlt: state.position.alt, targetVs: 0, altitudeConstraint: false };
  if (!flightPlan) return def;

  const wpts = flightPlan.waypoints.filter(w => !w.discontinuity);
  if (wpts.length === 0) return def;

  const idx = Math.min(nav.activeWaypointIndex, wpts.length - 1);
  const wpt = wpts[idx];
  const constraint = wpt.altitudeConstraint;
  if (!constraint) return def;

  const distNm = nav.alongTrackDist / 1852;
  const altDelta = constraint.altitude - state.position.alt;
  const tas = Math.sqrt(state.velocity.u ** 2 + state.velocity.v ** 2 + state.velocity.w ** 2) * 1.944;
  const timeSec = tas > 50 ? (distNm / tas) * 3600 : 999;
  const requiredVs = timeSec > 0 ? (altDelta / timeSec) * 60 : 0;

  return { targetAlt: constraint.altitude, targetVs: requiredVs, altitudeConstraint: true };
}
