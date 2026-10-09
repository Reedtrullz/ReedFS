import type { AircraftState, DerivedState } from '../types';
import { computeAirRelativeVelocity } from '../systems/environment';
import type { WindInfo } from '../weather';
import { atmosphereForDensityAltitude, type DensityAltitudeWeather } from './atmosphere';
import { calibratedAirspeedMs, impactPressureFromMach } from './airData';
import { bodyToNed } from './frames';
import { msToKt } from './units';

export function computeDerived(state: AircraftState, wind: WindInfo | null = null, weather: DensityAltitudeWeather | null = null): DerivedState {
  const airVelocity = computeAirRelativeVelocity(state, wind);
  const { u, v, w } = airVelocity;
  const tasMs = Math.sqrt(u * u + v * v + w * w);
  const atmo = atmosphereForDensityAltitude(state.position.alt, weather);
  const rhoRatio = atmo.density / 1.225;

  const tas = msToKt(tasMs);
  const eas = tas * Math.sqrt(Math.max(0, rhoRatio));
  const mach = tasMs / atmo.speedOfSound;
  const weatherValid = !weather || (Number.isFinite(weather.qnhHpa) && weather.qnhHpa >= 100 && weather.qnhHpa <= 1200
    && Number.isFinite(weather.surfaceTemperatureC) && weather.surfaceTemperatureC >= -100 && weather.surfaceTemperatureC <= 100);
  const impact = weatherValid && Number.isFinite(eas) ? impactPressureFromMach(mach, atmo.pressurePa) : null;
  const casMs = impact === null ? null : calibratedAirspeedMs(impact);
  const cas = casMs === null ? null : msToKt(casMs);
  const airDataValid = cas !== null;
  // Healthy IAS is ideal CAS: instrument/position errors are a separate #110 model.
  // Consumers must honor validity; zero is only the numeric tape fallback.
  const ias = cas ?? 0;
  const ned = bodyToNed(state.velocity, state.attitude);
  const gs = msToKt(Math.sqrt(ned.north * ned.north + ned.east * ned.east));
  const vsFpm = -ned.down * 196.850394; // down positive, VS positive climbing
  const aoa = u > 0.1 ? Math.atan2(w, u) : 0;
  const beta = tasMs > 0.1 ? Math.asin(Math.max(-1, Math.min(1, v / tasMs))) : 0;

  return { ias, tas, eas, cas, airDataValid, gs, mach, vs: vsFpm, aoa, beta };
}
