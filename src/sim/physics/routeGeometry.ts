// Spherical route geometry retains the existing nominal earth radius.
// This is not an ellipsoidal geodesic or a runway survey model.
export const ROUTE_EARTH_RADIUS_M = 6371000;
export interface Coordinate { lat: number; lon: number; }
const RAD = Math.PI / 180;
const clamp = (n: number) => Math.max(-1, Math.min(1, n));

export function hasValidCoordinates(point: { lat?: number | null; lon?: number | null } | null | undefined): point is Coordinate {
  return !!point && typeof point.lat === 'number' && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && typeof point.lon === 'number' && Number.isFinite(point.lon) && Math.abs(point.lon) <= 180;
}
export function normalizeLongitude(lon: number): number { return ((lon + 180) % 360 + 360) % 360 - 180; }

export function routeAngularDistance(from: Coordinate, to: Coordinate): number {
  const dLat = (to.lat - from.lat) * RAD; const dLon = normalizeLongitude(to.lon - from.lon) * RAD;
  const h = Math.min(1, Math.max(0, Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * RAD) * Math.cos(to.lat * RAD) * Math.sin(dLon / 2) ** 2));
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function routeDistanceM(from: Coordinate, to: Coordinate): number { return ROUTE_EARTH_RADIUS_M * routeAngularDistance(from, to); }

export function routeBearingRad(from: Coordinate, to: Coordinate): number {
  const lat1 = from.lat * RAD; const lat2 = to.lat * RAD; const dLon = normalizeLongitude(to.lon - from.lon) * RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  if (Math.hypot(x, y) < 1e-14) return 0; // coincident/pole: deterministic, no unique bearing
  return ((Math.atan2(y, x) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

export function interpolateRouteCoordinate(from: Coordinate, to: Coordinate, fraction: number): Coordinate {
  if (!hasValidCoordinates(from) || !hasValidCoordinates(to) || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError('Invalid route coordinates or interpolation fraction');
  }
  const angle = routeAngularDistance(from, to);
  if (Math.PI - angle < 1e-8) throw new RangeError('Antipodal route has no unique short path');
  if (angle < 1e-8) return { lat: from.lat + fraction * (to.lat - from.lat), lon: normalizeLongitude(from.lon + fraction * normalizeLongitude(to.lon - from.lon)) };
  const a = Math.sin((1 - fraction) * angle) / Math.sin(angle); const b = Math.sin(fraction * angle) / Math.sin(angle);
  const x = a * Math.cos(from.lat * RAD) * Math.cos(from.lon * RAD) + b * Math.cos(to.lat * RAD) * Math.cos(to.lon * RAD);
  const y = a * Math.cos(from.lat * RAD) * Math.sin(from.lon * RAD) + b * Math.cos(to.lat * RAD) * Math.sin(to.lon * RAD);
  const z = a * Math.sin(from.lat * RAD) + b * Math.sin(to.lat * RAD);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: normalizeLongitude(Math.atan2(y, x) / RAD) };
}

export function routeProjectionM(from: Coordinate, to: Coordinate, point: Coordinate) {
  const legLengthM = routeDistanceM(from, to);
  if (legLengthM < 1e-6) return null;
  const d = routeAngularDistance(from, point);
  const bearingDelta = routeBearingRad(from, point) - routeBearingRad(from, to);
  return { legLengthM,
    crossTrackM: Math.asin(clamp(Math.sin(d) * Math.sin(bearingDelta))) * ROUTE_EARTH_RADIUS_M,
    alongTrackM: Math.atan2(Math.sin(d) * Math.cos(bearingDelta), Math.cos(d)) * ROUTE_EARTH_RADIUS_M };
}
