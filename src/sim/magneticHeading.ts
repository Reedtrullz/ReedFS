import { WMM_2025_COEFFICIENTS, WMM_MODEL_ID } from './data/navigation/wmm2025';

export type HeadingReference = 'true' | 'magnetic';
export interface MagneticInput {
  latitudeDeg: number; longitudeDeg: number; heightAboveEllipsoidKm: number; utcMs: number;
}
export type MagneticFieldResult = { ok: false; reason: 'invalid-input' | 'unsupported-epoch' | 'blackout'; horizontalNt?: number }
  | { ok: true; modelId: typeof WMM_MODEL_ID; decimalYear: number; heightAboveEllipsoidKm: number;
    northNt: number; eastNt: number; downNt: number; horizontalNt: number; totalNt: number;
    inclinationDeg: number; declinationEastDeg: number; caution: boolean };

export function decimalYearUtc(utcMs: number): number | null {
  if (!Number.isFinite(utcMs)) return null;
  const year = new Date(utcMs).getUTCFullYear();
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
  return year + (utcMs - start) / (end - start);
}

/** CurrentWMM2025 NOAA blackout/caution policy, separate from numeric precision. */
export function magneticFieldBand(horizontalNt: number): 'unavailable' | 'caution' | 'normal' {
  return !Number.isFinite(horizontalNt) || horizontalNt < 2000 ? 'unavailable' : horizontalNt < 6000 ? 'caution' : 'normal';
}

const matrix = () => Array.from({ length: 13 }, () => new Float64Array(13));
// Typed port of NOAA public-domain geomag.c E0000 harmonic algorithm. Degree12
// normalization is immutable after initialization; current2025 data is separate.
const c = matrix(), cd = matrix(), norm = matrix(), k = matrix();
for (const [n, m, g, h, dg, dh] of WMM_2025_COEFFICIENTS) {
  c[m][n] = g; cd[m][n] = dg;
  if (m > 0) { c[n][m - 1] = h; cd[n][m - 1] = dh; }
}
norm[0][0] = 1;
for (let n = 1; n <= 12; n++) {
  norm[0][n] = norm[0][n - 1] * (2 * n - 1) / n;
  let j = 2;
  for (let m = 0; m <= n; m++) {
    k[m][n] = ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3));
    if (m > 0) {
      norm[m][n] = norm[m - 1][n] * Math.sqrt((n - m + 1) * j / (n + m)); j = 1;
      c[n][m - 1] *= norm[m][n]; cd[n][m - 1] *= norm[m][n];
    }
    c[m][n] *= norm[m][n]; cd[m][n] *= norm[m][n];
  }
}
k[1][1] = 0;

/** Generic field calculation at explicit WGS84 ellipsoid height; no MSL inference. */
export function wmm2025Field(input: MagneticInput): MagneticFieldResult {
  const { latitudeDeg: lat, longitudeDeg: lon, heightAboveEllipsoidKm: height, utcMs } = input;
  if (![lat, lon, height, utcMs].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || height < -1 || height > 100) {
    return { ok: false, reason: 'invalid-input' };
  }
  if (utcMs < Date.UTC(2025, 0, 1) || utcMs >= Date.UTC(2030, 0, 1)) return { ok: false, reason: 'unsupported-epoch' };
  const year = decimalYearUtc(utcMs);
  if (year === null) return { ok: false, reason: 'invalid-input' };
  const a = 6378.137, b = 6356.7523142, re = 6371.2, rad = Math.PI / 180;
  const a2 = a * a, b2 = b * b, c2 = a2 - b2, a4 = a2 * a2, c4 = a4 - b2 * b2;
  const sin = Math.sin(lat * rad), cos = Math.cos(lat * rad);
  const q = Math.sqrt(a2 - c2 * sin * sin), q1 = height * q, q2 = ((q1 + a2) / (q1 + b2)) ** 2;
  const ct = Math.max(-1, Math.min(1, sin / Math.sqrt(q2 * cos * cos + sin * sin)));
  const st = Math.sqrt(Math.max(0, 1 - ct * ct));
  const r = Math.sqrt(height * height + 2 * q1 + (a4 - c4 * sin * sin) / (q * q));
  const d = Math.sqrt(a2 * cos * cos + b2 * sin * sin), ca = (height + d) / r, sa = c2 * cos * sin / (r * d);
  const p = matrix(), dp = matrix(), sp = new Float64Array(13), cp = new Float64Array(13), pp = new Float64Array(13);
  p[0][0] = cp[0] = pp[0] = 1; sp[1] = Math.sin(lon * rad); cp[1] = Math.cos(lon * rad);
  for (let m = 2; m <= 12; m++) {
    sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1]; cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1];
  }
  const aor = re / r; let ar = aor * aor, br = 0, bt = 0, bp = 0, bpp = 0;
  const dt = year - 2025;
  for (let n = 1; n <= 12; n++) {
    ar *= aor;
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        p[m][n] = st * p[m - 1][n - 1]; dp[m][n] = st * dp[m - 1][n - 1] + ct * p[m - 1][n - 1];
      } else if (n === 1 && m === 0) {
        p[m][n] = ct * p[m][n - 1]; dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1];
      } else {
        p[m][n] = ct * p[m][n - 1] - k[m][n] * p[m][n - 2];
        dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1] - k[m][n] * dp[m][n - 2];
      }
      const g = c[m][n] + dt * cd[m][n], h = m === 0 ? 0 : c[n][m - 1] + dt * cd[n][m - 1];
      const temp1 = g * cp[m] + h * sp[m], temp2 = g * sp[m] - h * cp[m];
      const par = ar * p[m][n]; bt -= ar * temp1 * dp[m][n]; bp += m * temp2 * par; br += (n + 1) * temp1 * par;
      if (st === 0 && m === 1) {
        pp[n] = n === 1 ? pp[n - 1] : ct * pp[n - 1] - k[m][n] * pp[n - 2]; bpp += m * temp2 * ar * pp[n];
      }
    }
  }
  bp = st === 0 ? bpp : bp / st;
  const northNt = -bt * ca - br * sa, eastNt = bp, downNt = bt * sa - br * ca;
  const horizontalNt = Math.hypot(northNt, eastNt), totalNt = Math.hypot(horizontalNt, downNt);
  const inclinationDeg = Math.atan2(downNt, horizontalNt) / rad, declinationEastDeg = Math.atan2(eastNt, northNt) / rad;
  if (![northNt, eastNt, downNt, horizontalNt, totalNt, inclinationDeg, declinationEastDeg].every(Number.isFinite)) {
    return { ok: false, reason: 'invalid-input' };
  }
  const band = magneticFieldBand(horizontalNt);
  if (band === 'unavailable') return { ok: false, reason: 'blackout', horizontalNt };
  return { ok: true, modelId: WMM_MODEL_ID, decimalYear: year, heightAboveEllipsoidKm: height,
    northNt, eastNt, downNt, horizontalNt, totalNt, inclinationDeg, declinationEastDeg, caution: band === 'caution' };
}

const wrapHeading = (value: number) => ((value % 360) + 360) % 360;
function finiteAngle(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function validVariation(value: unknown): value is number { return finiteAngle(value) && Math.abs(value) <= 180; }

/** The actual MCP command boundary requires a reference; untagged courses reject. */
export function toTrueHeading(input: unknown): number | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  if (!finiteAngle(value.degrees)) return null;
  if (value.reference === 'true') return wrapHeading(value.degrees);
  return value.reference === 'magnetic' && validVariation(value.variationEastDeg)
    ? wrapHeading(value.degrees + value.variationEastDeg) : null;
}

export function fromTrueHeading(value: number, reference: HeadingReference, variationEastDeg: number | null): number | null {
  if (!finiteAngle(value)) return null;
  if (reference === 'true') return wrapHeading(value);
  return reference === 'magnetic' && validVariation(variationEastDeg) ? wrapHeading(value - variationEastDeg) : null;
}
