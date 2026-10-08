import { afterEach, expect, it } from 'vitest';
import type { FlightPlan } from '@shared/types/fmc';
import { B737_800_SPEC, createInitialState } from '../../types';
import { computeRouteStatus } from '../navigation';
import { useSimStore } from '../../../store/simStore';
import { createDirectFlight, createKseaKpdxFlight } from '../../flightPlanLoader';
import { ecefToGeodetic, geodeticToEcef } from '../../physics/geodesy';
import { createRouteSourceFromFlightPlan } from '../../fms/routeAdapter';
import { isFlightPlan } from '../../simulationValidation';
import { KSEA_RUNWAY_16L } from '../../../viewport/runwayData';

afterEach(() => useSimStore.getState().reset());
function route(points: Array<[number, number]>): FlightPlan {
  return { origin: 'ORIG', destination: 'DEST', flightNumber: 'GEOTEST', route: 'ORIG DEST',
    waypoints: points.map(([lat, lon], index) => ({ ident: `P${index}`, lat, lon, discontinuity: false })) };
}

it('179/-179 crosses east along the short two-degree equatorial path', () => {
  const aircraft = createInitialState(B737_800_SPEC); aircraft.position = { lat: 0, lon: 179, alt: 1000 };
  const status = computeRouteStatus(aircraft, route([[0, 179], [0, -179]]), 0);
  expect(status.lnavAvailable).toBe(true);
  expect(status.distanceToNextM).toBeCloseTo(6371000 * Math.PI / 90, 3);
  expect(status.desiredTrackDegTrue).toBeCloseTo(90, 8);
  expect(status.legLengthM).toBeCloseTo(status.distanceToNextM!, 3);
});

it('a polar great-circle leg is finite and heads toward the pole', () => {
  const aircraft = createInitialState(B737_800_SPEC); aircraft.position = { lat: 89, lon: -90, alt: 1000 };
  const status = computeRouteStatus(aircraft, route([[89, -90], [89, 90]]), 0);
  expect(status.lnavAvailable).toBe(true);
  expect(status.distanceToNextM).toBeCloseTo(6371000 * Math.PI / 90, 3);
  expect(Math.min(status.desiredTrackDegTrue!, 360 - status.desiredTrackDegTrue!)).toBeLessThan(.001);
  expect(Number.isFinite(status.crossTrackErrorM)).toBe(true);
});

it('rejects out-of-range imported route coordinates before any store mutation', () => {
  useSimStore.getState().setFlightPlan(createKseaKpdxFlight());
  for (const [lat, lon] of [[91, 0], [0, 181], [-91, 0], [0, -181], [NaN, 0]]) {
    const before = useSimStore.getState();
    expect(() => before.setFlightPlan(route([[lat, lon], [0, 1]]))).toThrow(/coordinates|flight plan/i);
    expect(useSimStore.getState()).toBe(before);
  }
});

it('rejects invalid coordinates in pure route guidance with a controlled reason', () => {
  const aircraft = createInitialState(B737_800_SPEC);
  const status = computeRouteStatus(aircraft, route([[91, 0], [0, 1]]), 0);
  expect(status.routeValid).toBe(false); expect(status.lnavUnavailableReason).toMatch(/coordinates/i);
});

it('the exact ECEF pole has finite latitude, deterministic longitude and correct height', () => {
  // WGS84 polar radius: a(1-f), independently specified ellipsoid geometry.
  const b = 6378137 * (1 - 1 / 298.257223563);
  for (const sign of [-1, 1]) {
    const geo = ecefToGeodetic(0, 0, sign * (b + 250));
    expect(geo.lat).toBe(sign * 90); expect(geo.lon).toBe(0); expect(geo.alt).toBeCloseTo(250, 6);
  }
});

it('rejects malformed adapter and runway imports without replacing aircraft, route, or revisions', () => {
  const malformed = route([[0, Infinity], [0, 1]]);
  expect(() => createRouteSourceFromFlightPlan(malformed, { id: 'bad', type: 'manual', label: 'Bad' })).toThrow(/coordinates|flight plan/i);
  for (const patch of [
    { start: { ...KSEA_RUNWAY_16L.start, lat: 91 } },
    { end: { ...KSEA_RUNWAY_16L.start, lon: -181 } },
  ]) {
    const before = useSimStore.getState();
    expect(() => before.setFlightPlanAtRunway(createKseaKpdxFlight(), { ...KSEA_RUNWAY_16L, ...patch })).toThrow(/coordinates/);
    expect(useSimStore.getState()).toBe(before);
  }
  const before = useSimStore.getState();
  expect(() => before.setFlightPlanAtRunway(malformed, KSEA_RUNWAY_16L)).toThrow(/flight plan/);
  expect(useSimStore.getState()).toBe(before);
});

it('sequences duplicate waypoints and refuses ambiguous antipodal guidance', () => {
  const aircraft = createInitialState(B737_800_SPEC); aircraft.position = { lat: 0, lon: 0, alt: 1000 };
  const duplicate = computeRouteStatus(aircraft, route([[0, 0], [0, 0], [0, 1]]), 0);
  expect(duplicate.lnavAvailable).toBe(true); expect(duplicate.activeLegIndex).toBe(1);
  expect(duplicate.desiredTrackDegTrue).toBeCloseTo(90, 8);
  expect(Number.isFinite(duplicate.distanceToNextM)).toBe(true);
  const ambiguous = computeRouteStatus(aircraft, route([[0, 0], [0, 180]]), 0);
  expect(ambiguous.routeValid).toBe(false); expect(ambiguous.lnavUnavailableReason).toMatch(/antipodal/);
});

it('preserves the two regional training-route lengths within 0.1% of their prior local model', () => {
  for (const [origin, destination, lat, lon, previousM] of [
    ['KSEA', 'KPDX', 47.45, -122.31, 208009.42085001818],
    ['ENVA', 'ENGM', 63.4583, 10.9101, 363122.1877911477],
  ] as const) {
    const aircraft = createInitialState(B737_800_SPEC); aircraft.position = { lat, lon, alt: 1000 };
    const status = computeRouteStatus(aircraft, createDirectFlight(origin, destination), 0);
    expect(status.lnavAvailable).toBe(true);
    expect(Math.abs(status.legLengthM! / previousM - 1)).toBeLessThan(.001);
  }
});

it('retains existing WGS84 near-pole round trips and rejects the undefined ECEF origin', () => {
  for (const lat of [-90, -89.999, 89.999, 90]) {
    const ecef = geodeticToEcef(lat, 40, 250); const geo = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(geo.lat).toBeCloseTo(lat, 8); expect(geo.alt).toBeCloseTo(250, 2);
  }
  expect(() => ecefToGeodetic(0, 0, 0)).toThrow(/Undefined/);
});


it('rejects either partial coordinate pair at every shared import boundary without mutation', () => {
  for (const missing of ['lat', 'lon'] as const) {
    const partial = route([[0, 0], [0, 1]]); delete partial.waypoints[0][missing];
    expect(isFlightPlan(partial)).toBe(false);
    const before = useSimStore.getState();
    expect(() => before.setFlightPlan(partial)).toThrow(/flight plan/i);
    expect(useSimStore.getState()).toBe(before);
    expect(() => before.setFlightPlanAtRunway(partial, KSEA_RUNWAY_16L)).toThrow(/flight plan/i);
    expect(useSimStore.getState()).toBe(before);
    expect(() => createRouteSourceFromFlightPlan(partial, { id: 'partial', type: 'manual', label: 'Partial' })).toThrow(/flight plan/i);
  }
});

it('preserves existing coordinate-free discontinuities while guidance stays unavailable', () => {
  const plan = route([[0, 0], [0, 1]]);
  plan.waypoints[0] = { ident: 'DISCO', discontinuity: true };
  expect(isFlightPlan(plan)).toBe(true);
  expect(() => useSimStore.getState().setFlightPlan(plan)).not.toThrow();
  expect(useSimStore.getState().routeStatus.lnavAvailable).toBe(false);
});


it('rejects explicit null route coordinates at shared boundaries without mutation', () => {
  for (const [lat, lon] of [[null, 0], [0, null], [null, null]]) {
    const plan = route([[0, 0], [0, 1]]);
    const malformed = { ...plan, waypoints: [{ ...plan.waypoints[0], lat, lon }, plan.waypoints[1]] } as unknown as FlightPlan;
    expect(isFlightPlan(malformed)).toBe(false);
    const before = useSimStore.getState();
    expect(() => before.setFlightPlan(malformed)).toThrow(/flight plan/i);
    expect(useSimStore.getState()).toBe(before);
    expect(() => before.setFlightPlanAtRunway(malformed, KSEA_RUNWAY_16L)).toThrow(/flight plan/i);
    expect(useSimStore.getState()).toBe(before);
    expect(() => createRouteSourceFromFlightPlan(malformed, { id: 'null', type: 'manual', label: 'Null' })).toThrow(/flight plan/i);
  }
});
