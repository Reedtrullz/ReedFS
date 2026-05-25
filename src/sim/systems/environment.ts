import { nedToBody, type NedVelocity } from '../physics/frames';
import type { AircraftState, BodyVelocity } from '../types';
import type { WindInfo } from '../weather';

export function windToNed(wind: WindInfo): NedVelocity {
  if (wind.speed < 0.5) return { north: 0, east: 0, down: 0 };

  const windDirRad = (wind.dir * Math.PI) / 180;
  const windMs = wind.speed * 0.514444;

  return {
    north: -windMs * Math.cos(windDirRad),
    east: -windMs * Math.sin(windDirRad),
    down: 0,
  };
}

export function computeAirRelativeVelocity(state: AircraftState, wind: WindInfo | null): BodyVelocity {
  if (!wind || wind.speed < 0.5) return { ...state.velocity };

  const windBody = nedToBody(windToNed(wind), state.attitude);
  return {
    u: state.velocity.u - windBody.u,
    v: state.velocity.v - windBody.v,
    w: state.velocity.w - windBody.w,
  };
}
