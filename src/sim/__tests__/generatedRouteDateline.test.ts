import { afterEach, expect, it } from 'vitest';
import { createRunwayToRunwayFlightWithRunways } from '../flightPlanLoader';
import { KSEA_RUNWAY_16L, SUPPORTED_RUNWAYS } from '../../viewport/runwayData';

const originalCount = SUPPORTED_RUNWAYS.length;
afterEach(() => { SUPPORTED_RUNWAYS.splice(originalCount); });

it('generated route fixes interpolate the intended short dateline path', () => {
  // Test-owned fictional lookup inputs exercise the production public route builder.
  for (const [airport, lon] of [['DATW', 179], ['DATE', -179]] as const) {
    SUPPORTED_RUNWAYS.push({ ...KSEA_RUNWAY_16L, airport, id: '09', oppositeId: '27', headingDeg: 90, elevationFt: 0,
      start: { lat: 0, lon, altFt: 0 }, end: { lat: 0, lon: lon + .02, altFt: 0 } });
  }
  const result = createRunwayToRunwayFlightWithRunways({ originAirport: 'DATW', originRunway: '09', destinationAirport: 'DATE', destinationRunway: '09' });
  const enroute = result.flightPlan.waypoints.find((w) => w.ident === 'DATWDATE_ENR')!;
  expect(enroute.lon).toBeCloseTo(179.96, 6);
  expect(enroute.altitudeConstraint?.altitude).toBe(12000);
  for (const point of result.flightPlan.waypoints) expect(Math.abs(point.lon!)).toBeGreaterThan(178);
});
