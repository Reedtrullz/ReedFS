import type { AtmoConditions } from './atmosphere';

const STANDARD_PRESSURE_PA = 101325;
const STANDARD_SOUND_SPEED_MS = 340.294; // US Standard Atmosphere 1976, Table 10

/** Ideal subsonic pitot pressure, NACA Report 837 equations 1–3. */
export function impactPressureFromMach(mach: number, pressurePa: number): number | null {
  if (!Number.isFinite(mach) || mach < 0 || mach >= 1 || !Number.isFinite(pressurePa) || pressurePa <= 0) return null;
  const impact = pressurePa * Math.expm1(3.5 * Math.log1p(0.2 * mach * mach));
  return Number.isFinite(impact) ? impact : null;
}

export function machFromImpactPressure(impactPa: number, pressurePa: number): number | null {
  if (!Number.isFinite(impactPa) || impactPa < 0 || !Number.isFinite(pressurePa) || pressurePa <= 0) return null;
  const mach = Math.sqrt(5 * Math.expm1((2 / 7) * Math.log1p(impactPa / pressurePa)));
  return Number.isFinite(mach) && mach < 1 ? mach : null;
}

export function calibratedAirspeedMs(impactPa: number): number | null {
  const mach = machFromImpactPressure(impactPa, STANDARD_PRESSURE_PA);
  return mach === null ? null : STANDARD_SOUND_SPEED_MS * mach;
}

/** CAS fixture/target inversion; null when either reference or local flow is unsupported. */
export function trueAirspeedFromCasMs(casMs: number, atmosphere: AtmoConditions): number | null {
  const impact = impactPressureFromMach(casMs / STANDARD_SOUND_SPEED_MS, STANDARD_PRESSURE_PA);
  const mach = impact === null ? null : machFromImpactPressure(impact, atmosphere.pressurePa);
  return mach === null || !Number.isFinite(atmosphere.speedOfSound) || atmosphere.speedOfSound <= 0
    ? null : mach * atmosphere.speedOfSound;
}
