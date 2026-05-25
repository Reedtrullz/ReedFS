import type { AircraftState, DerivedState } from '../types';
import { computeAirRelativeVelocity } from '../systems/environment';
import type { WindInfo } from '../weather';
import { isaAtAltitude } from './atmosphere';
import { bodyToNed } from './frames';
import { msToKt } from './units';

export function computeDerived(state: AircraftState, wind: WindInfo | null = null): DerivedState {
  const airVelocity = computeAirRelativeVelocity(state, wind);
  const { u, v, w } = airVelocity;
  const tasMs = Math.sqrt(u * u + v * v + w * w);
  const atmo = isaAtAltitude(state.position.alt);
  const rhoRatio = atmo.density / 1.225;

  const tas = msToKt(tasMs);
  const ias = tas * Math.sqrt(Math.max(0.05, rhoRatio));
  const mach = tasMs / atmo.speedOfSound;
  const ned = bodyToNed(state.velocity, state.attitude);
  const gs = msToKt(Math.sqrt(ned.north * ned.north + ned.east * ned.east));
  const vsFpm = -ned.down * 196.850394; // down positive, VS positive climbing
  const aoa = u > 0.1 ? Math.atan2(w, u) : 0;
  const beta = tasMs > 0.1 ? Math.asin(Math.max(-1, Math.min(1, v / tasMs))) : 0;

  return { ias, tas, gs, mach, vs: vsFpm, aoa, beta };
}
