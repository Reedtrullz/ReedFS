import type { AircraftState } from './types';
import { scenarioUtcMs } from './scenarioClock';
import { fromTrueHeading, wmm2025Field, type HeadingReference } from './magneticHeading';

export interface HeadingDisplayContext {
  reference: HeadingReference;
  suffix: 'T' | 'M SFC' | 'M SFC !';
  variationEastDeg: number | null;
  unavailableReason: string | null;
  heightAboveEllipsoidKm: 0;
  caution: boolean;
  decimalYear: number | null;
}
const TRUE: HeadingDisplayContext = { reference: 'true', suffix: 'T', variationEastDeg: null,
  unavailableReason: null, heightAboveEllipsoidKm: 0, caution: false, decimalYear: null };
const unavailable = (reason: string): HeadingDisplayContext => ({ ...TRUE, unavailableReason: reason });
// One exact-point entry, shared by presentation consumers. No unbounded cache or
// geographic/time rounding; physical state remains the sole position/UTC source.
let last: { lat: number; lon: number; utc: number; result: HeadingDisplayContext } | null = null;

export function headingDisplayContext(aircraft: AircraftState, requested: HeadingReference): HeadingDisplayContext {
  if (requested === 'true') return TRUE;
  const { lat, lon } = aircraft.position; const utc = scenarioUtcMs(aircraft);
  if (last && last.lat === lat && last.lon === lon && last.utc === utc) return last.result;
  let result: HeadingDisplayContext;
  if (![lat, lon, utc].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180) result = unavailable('invalid location');
  else if (Math.abs(lat) === 90) result = unavailable('geographic pole');
  else {
    const field = wmm2025Field({ latitudeDeg: lat, longitudeDeg: lon, heightAboveEllipsoidKm: 0, utcMs: utc });
    if (!field.ok) result = unavailable(field.reason === 'unsupported-epoch' ? 'unsupported epoch' : field.reason === 'blackout' ? 'weak horizontal field' : 'invalid model input');
    else result = { reference: 'magnetic', suffix: field.caution ? 'M SFC !' : 'M SFC',
      variationEastDeg: field.declinationEastDeg, unavailableReason: null, heightAboveEllipsoidKm: 0,
      caution: field.caution, decimalYear: field.decimalYear };
  }
  last = { lat, lon, utc, result }; return result;
}

export function headingDisplayText(trueDegrees: number | null | undefined, context: HeadingDisplayContext): string {
  const degrees = typeof trueDegrees === 'number' ? fromTrueHeading(trueDegrees, context.reference, context.variationEastDeg) : null;
  return `${degrees === null ? '---' : String(Math.round(degrees) % 360).padStart(3, '0')}${context.suffix}`;
}
