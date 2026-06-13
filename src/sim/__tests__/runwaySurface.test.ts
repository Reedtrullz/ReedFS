import { describe, expect, it } from 'vitest';
import { KPDX_RUNWAY_10R, KSEA_RUNWAY_16L, type RunwayReference } from '../../viewport/runwayData';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { createInitialState, B737_800_SPEC, type GeoPosition } from '../types';
import { OFF_RUNWAY_FRICTION_SCALE, sampleKseaSurface, sampleSupportedAirportSurface } from '../runwaySurface';

function offsetPositionMeters(
  position: { lat: number; lon: number; altFt?: number; alt?: number },
  northM: number,
  eastM: number,
): { lat: number; lon: number; alt: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(position.lat * Math.PI / 180);
  return {
    lat: position.lat + northM / metersPerDegreeLat,
    lon: position.lon + eastM / metersPerDegreeLon,
    alt: position.alt ?? position.altFt ?? KSEA_RUNWAY_16L.elevationFt,
  };
}

function geoPositionForRunwayStart(runway: RunwayReference): GeoPosition {
  return {
    lat: runway.start.lat,
    lon: runway.start.lon,
    alt: runway.elevationFt,
  };
}

describe('sampleKseaSurface', () => {
  it('classifies a runway threshold position as prepared runway', () => {
    const sample = sampleKseaSurface(geoPositionForRunwayStart(KSEA_RUNWAY_16L));

    expect(sample.kind).toBe('runway');
    expect(sample.onRunway).toBe(true);
    expect(sample.runwayId).toBe('16L');
    expect(sample.groundAltFt).toBe(KSEA_RUNWAY_16L.elevationFt);
    expect(sample.runwayHalfWidthM).toBe(KSEA_RUNWAY_16L.widthM / 2);
    expect(Math.abs(sample.lateralOffsetM ?? 0)).toBeLessThan(1e-6);
    expect(sample.alongTrackM ?? 0).toBeGreaterThanOrEqual(-1);
    expect(sample.frictionScale.rolling).toBe(1);
    expect(sample.frictionScale.brake).toBe(1);
    expect(sample.frictionScale.side).toBe(1);
  });

  it('classifies a point beyond runway width as off-runway ground', () => {
    const eastOfRunway = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);

    const sample = sampleKseaSurface(eastOfRunway);

    expect(sample.kind).toBe('offRunway');
    expect(sample.onRunway).toBe(false);
    expect(sample.runwayId).toBeUndefined();
    expect(sample.runwayHalfWidthM).toBe(KSEA_RUNWAY_16L.widthM / 2);
    expect(Math.abs(sample.lateralOffsetM ?? 0)).toBeGreaterThan(KSEA_RUNWAY_16L.widthM / 2);
    expect(sample.groundAltFt).toBe(KSEA_RUNWAY_16L.elevationFt);
    expect(sample.frictionScale.rolling).toBeGreaterThan(1);
    expect(sample.frictionScale.brake).toBeLessThan(1);
    expect(sample.frictionScale.side).toBeLessThan(1);
  });

  it('classifies a point beyond runway length as off-runway ground', () => {
    const headingRad = KSEA_RUNWAY_16L.headingDeg * Math.PI / 180;
    const beyondDepartureEnd = offsetPositionMeters(
      KSEA_RUNWAY_16L.start,
      Math.cos(headingRad) * (KSEA_RUNWAY_16L.lengthM + 200),
      Math.sin(headingRad) * (KSEA_RUNWAY_16L.lengthM + 200),
    );

    const sample = sampleKseaSurface(beyondDepartureEnd);

    expect(sample.kind).toBe('offRunway');
    expect(sample.onRunway).toBe(false);
  });

  it('does not classify a KPDX runway threshold as KSEA runway surface', () => {
    const sample = sampleKseaSurface(geoPositionForRunwayStart(KPDX_RUNWAY_10R));

    expect(sample.kind).toBe('offRunway');
    expect(sample.onRunway).toBe(false);
    expect(sample.runwayId).toBeUndefined();
  });

  it('classifies scenario start positions as prepared runway', () => {
    const tutorialSurface = sampleKseaSurface(KSEA_TUTORIAL_SCENARIO.position);

    expect(tutorialSurface.kind).toBe('runway');
    expect(tutorialSurface.onRunway).toBe(true);
    expect(tutorialSurface.runwayId).toBe(KSEA_TUTORIAL_SCENARIO.runway.runway);
  });

  it('classifies the default initial state consistently with its ground state', () => {
    const defaultState = createInitialState(B737_800_SPEC);
    defaultState.position = { lat: KSEA_RUNWAY_16L.start.lat, lon: KSEA_RUNWAY_16L.start.lon, alt: KSEA_RUNWAY_16L.elevationFt };
    defaultState.ground.groundAltFt = KSEA_RUNWAY_16L.elevationFt;
    const surface = sampleKseaSurface(defaultState.position);

    expect(surface.kind).toBe('runway');
    expect(surface.onRunway).toBe(true);
    expect(defaultState.ground.onRunway).toBe(true);
    expect(defaultState.ground.groundAltFt).toBe(surface.groundAltFt);
  });
});

describe('sampleSupportedAirportSurface', () => {
  it('classifies a KPDX runway threshold position as prepared runway', () => {
    const sample = sampleSupportedAirportSurface(geoPositionForRunwayStart(KPDX_RUNWAY_10R));

    expect(sample.kind).toBe('runway');
    expect(sample.onRunway).toBe(true);
    expect(sample.airport).toBe('KPDX');
    expect(sample.runwayId).toBe('10R');
    expect(sample.groundAltFt).toBe(KPDX_RUNWAY_10R.elevationFt);
  });

  it('classifies a KPDX point beyond runway width as off-runway ground', () => {
    const headingRad = KPDX_RUNWAY_10R.headingDeg * Math.PI / 180;
    const lateralOffsetM = KPDX_RUNWAY_10R.widthM / 2 + 50;
    const offRunwayPosition = offsetPositionMeters(
      geoPositionForRunwayStart(KPDX_RUNWAY_10R),
      -Math.sin(headingRad) * lateralOffsetM,
      Math.cos(headingRad) * lateralOffsetM,
    );

    const sample = sampleSupportedAirportSurface(offRunwayPosition);

    expect(sample.kind).toBe('offRunway');
    expect(sample.onRunway).toBe(false);
    expect(sample.runwayId).toBeUndefined();
    expect(sample.groundAltFt).toBe(KPDX_RUNWAY_10R.elevationFt);
    expect(sample.frictionScale).toEqual(OFF_RUNWAY_FRICTION_SCALE);
  });

  it('uses the KPDX 10R fallback elevation near the departure end when laterally off-runway', () => {
    const headingRad = KPDX_RUNWAY_10R.headingDeg * Math.PI / 180;
    const alongTrackM = KPDX_RUNWAY_10R.lengthM - 250;
    const lateralOffsetM = KPDX_RUNWAY_10R.widthM / 2 + 75;
    const offRunwayPosition = offsetPositionMeters(
      geoPositionForRunwayStart(KPDX_RUNWAY_10R),
      Math.cos(headingRad) * alongTrackM - Math.sin(headingRad) * lateralOffsetM,
      Math.sin(headingRad) * alongTrackM + Math.cos(headingRad) * lateralOffsetM,
    );

    const sample = sampleSupportedAirportSurface(offRunwayPosition);

    expect(sample.kind).toBe('offRunway');
    expect(sample.onRunway).toBe(false);
    expect(sample.runwayId).toBeUndefined();
    expect(sample.airport).toBe('KPDX');
    expect(sample.groundAltFt).toBe(KPDX_RUNWAY_10R.elevationFt);
    expect(sample.frictionScale).toEqual(OFF_RUNWAY_FRICTION_SCALE);
  });

  it('classifies terrain far from supported airports explicitly instead of borrowing a runway fallback', () => {
    const unsupported = { lat: 0, lon: 0, alt: 1_234 };

    const sample = sampleSupportedAirportSurface(unsupported);

    expect(sample.kind).toBe('unsupportedTerrain');
    expect(sample.onRunway).toBe(false);
    expect(sample.airport).toBeUndefined();
    expect(sample.runwayId).toBeUndefined();
    expect(sample.groundAltFt).toBe(unsupported.alt);
    expect(sample.frictionScale).toEqual(OFF_RUNWAY_FRICTION_SCALE);
  });

  it('matches KSEA wrapper classification fields for a KSEA threshold position', () => {
    const kseaThresholdPosition = geoPositionForRunwayStart(KSEA_RUNWAY_16L);

    const supportedSample = sampleSupportedAirportSurface(kseaThresholdPosition);
    const kseaSample = sampleKseaSurface(kseaThresholdPosition);

    expect(supportedSample.kind).toBe(kseaSample.kind);
    expect(supportedSample.onRunway).toBe(kseaSample.onRunway);
    expect(supportedSample.runwayId).toBe(kseaSample.runwayId);
    expect(supportedSample.groundAltFt).toBe(kseaSample.groundAltFt);
    expect(supportedSample.frictionScale).toEqual(kseaSample.frictionScale);
    expect(supportedSample.alongTrackM).toBeCloseTo(kseaSample.alongTrackM ?? 0, 6);
    expect(supportedSample.lateralOffsetM).toBeCloseTo(kseaSample.lateralOffsetM ?? 0, 6);
    expect(supportedSample.airport).toBe('KSEA');
  });
});
