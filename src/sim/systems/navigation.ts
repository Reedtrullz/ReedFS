import type { AircraftState } from '../types';
import type { FlightPlan } from '@shared/types/fmc';

export interface NavOutput {
  crossTrackError: number;
  alongTrackDist: number;
  desiredTrack: number; // radians true
  activeWaypointIndex: number;
  waypointReached: boolean;
}

export function computeLNAV(
  state: AircraftState,
  flightPlan: FlightPlan | null,
  activeWptIndex: number,
): NavOutput {
  const def: NavOutput = {
    crossTrackError: 0,
    alongTrackDist: 0,
    desiredTrack: state.attitude.psi,
    activeWaypointIndex: 0,
    waypointReached: false,
  };

  if (!flightPlan || flightPlan.waypoints.length === 0) return def;

  const wpts = flightPlan.waypoints.filter(w => !w.discontinuity);
  if (wpts.length === 0) return def;

  const idx = Math.min(activeWptIndex, wpts.length - 1);
  const wpt = wpts[idx];

  if (wpt.lat === undefined || wpt.lon === undefined) return def;

  const dLat = (wpt.lat - state.position.lat) * (Math.PI / 180);
  const dLon = (wpt.lon - state.position.lon) * (Math.PI / 180);
  const latR = state.position.lat * (Math.PI / 180);

  const x = dLon * Math.cos(latR);
  const y = dLat;
  const desiredTrack = Math.atan2(x, y);
  const distDeg = Math.sqrt(x * x + y * y);
  const distM = distDeg * 6371000; // spherical Earth

  const waypointReached = distM < 185; // 0.1 NM

  return {
    crossTrackError: 0, // simplified — direct-to waypoint
    alongTrackDist: distM,
    desiredTrack,
    activeWaypointIndex: idx,
    waypointReached,
  };
}
