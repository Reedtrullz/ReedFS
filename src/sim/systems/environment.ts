import type { AircraftState } from '../types';
import type { WindInfo } from '../weather';

export function applyWind(state: AircraftState, wind: WindInfo): void {
  if (wind.speed < 0.5) return;

  const windDirRad = (wind.dir * Math.PI) / 180;
  const windMs = wind.speed * 0.514444;
  const windN = -windMs * Math.cos(windDirRad);
  const windE = -windMs * Math.sin(windDirRad);

  const { phi, theta, psi } = state.attitude;
  const sphi = Math.sin(phi),
    cphi = Math.cos(phi);
  const stht = Math.sin(theta),
    ctht = Math.cos(theta);
  const spsi = Math.sin(psi),
    cpsi = Math.cos(psi);

  const windBodyU = windN * (ctht * cpsi) + windE * (ctht * spsi);
  const windBodyV =
    windN * (sphi * stht * cpsi - cphi * spsi) + windE * (sphi * stht * spsi + cphi * cpsi);
  const windBodyW =
    windN * (cphi * stht * cpsi + sphi * spsi) + windE * (cphi * stht * spsi - sphi * cpsi);

  state.velocity.u -= windBodyU;
  state.velocity.v -= windBodyV;
  state.velocity.w -= windBodyW;
}
