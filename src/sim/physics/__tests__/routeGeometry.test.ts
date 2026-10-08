import { expect, it } from 'vitest';
import { hasValidCoordinates, interpolateRouteCoordinate, routeDistanceM, routeProjectionM } from '../routeGeometry';

it('interpolates across the dateline and through the pole with finite in-range coordinates', () => {
  const from = { lat: 0, lon: 179 }; const to = { lat: 0, lon: -179 };
  expect(interpolateRouteCoordinate(from, to, 0)).toEqual(from);
  expect(interpolateRouteCoordinate(from, to, .5)).toEqual({ lat: 0, lon: -180 });
  expect(interpolateRouteCoordinate(from, to, 1)).toEqual(to);
  const polar = interpolateRouteCoordinate({ lat: 89, lon: -90 }, { lat: 89, lon: 90 }, .5);
  expect(polar.lat).toBeCloseTo(90, 8); expect(hasValidCoordinates(polar)).toBe(true);
});

it('handles coincident and almost-coincident wrapped points without division instability', () => {
  const same = { lat: 40, lon: 179 };
  expect(routeDistanceM(same, same)).toBe(0);
  expect(interpolateRouteCoordinate(same, same, .5)).toEqual(same);
  expect(routeProjectionM(same, same, same)).toBeNull();
  const a = { lat: 40, lon: 179.9999999999 }; const b = { lat: 40, lon: -179.9999999999 };
  expect(routeDistanceM(a, b)).toBeLessThan(.001);
  expect(hasValidCoordinates(interpolateRouteCoordinate(a, b, .5))).toBe(true);
});

it('keeps signed cross-track and along-track distances consistent on a dateline leg', () => {
  const from = { lat: 0, lon: 179 }; const to = { lat: 0, lon: -179 };
  const oneDegreeM = 6371000 * Math.PI / 180;
  for (const sign of [-1, 1]) {
    const projection = routeProjectionM(from, to, { lat: sign, lon: 180 })!;
    expect(projection.alongTrackM).toBeCloseTo(oneDegreeM, 6);
    expect(projection.crossTrackM).toBeCloseTo(-sign * oneDegreeM, 6);
  }
});

it('rejects ambiguous antipodes and malformed interpolation inputs', () => {
  expect(() => interpolateRouteCoordinate({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }, .5)).toThrow(/Antipodal/);
  expect(() => interpolateRouteCoordinate({ lat: 91, lon: 0 }, { lat: 0, lon: 1 }, .5)).toThrow(/Invalid/);
  expect(() => interpolateRouteCoordinate({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, NaN)).toThrow(/Invalid/);
  expect(hasValidCoordinates(undefined)).toBe(false); expect(hasValidCoordinates(null)).toBe(false);
});

it('bounds the nominal sphere against independently published ellipsoidal long-route examples', () => {
  // GeographicLib's published WGS84 examples; 0.6% is an approximation envelope,
  // not an ellipsoidal-accuracy claim. No runtime geodesic dependency is added.
  for (const [from, to, ellipsoidalM] of [
    [{ lat: -41.32, lon: 174.81 }, { lat: 40.96, lon: -5.50 }, 19959679.267],
    [{ lat: 40.1, lon: 116.6 }, { lat: 37.6, lon: -122.4 }, 9513998],
  ] as const) {
    expect(Math.abs(routeDistanceM(from, to) / ellipsoidalM - 1)).toBeLessThan(.006);
    expect(hasValidCoordinates(interpolateRouteCoordinate(from, to, .5))).toBe(true);
  }
});
