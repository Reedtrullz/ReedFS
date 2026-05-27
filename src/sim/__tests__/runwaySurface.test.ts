import { describe, expect, it } from 'vitest';
import { KSEA_RUNWAY_16L } from '../../viewport/runwayData';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { createInitialState, B737_800_SPEC } from '../types';
import { sampleKseaSurface } from '../runwaySurface';

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

describe('sampleKseaSurface', () => {
  it('classifies a runway threshold position as prepared runway', () => {
    const sample = sampleKseaSurface({
      lat: KSEA_RUNWAY_16L.start.lat,
      lon: KSEA_RUNWAY_16L.start.lon,
      alt: KSEA_RUNWAY_16L.elevationFt,
    });

    expect(sample.kind).toBe('runway');
    expect(sample.onRunway).toBe(true);
    expect(sample.runwayId).toBe('16L');
    expect(sample.groundAltFt).toBe(KSEA_RUNWAY_16L.elevationFt);
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

  it('classifies scenario start positions as prepared runway', () => {
    const tutorialSurface = sampleKseaSurface(KSEA_TUTORIAL_SCENARIO.position);

    expect(tutorialSurface.kind).toBe('runway');
    expect(tutorialSurface.onRunway).toBe(true);
    expect(tutorialSurface.runwayId).toBe(KSEA_TUTORIAL_SCENARIO.runway.runway);
  });

  it('documents the legacy default initial state mismatch until Task 2 aligns it', () => {
    const defaultState = createInitialState(B737_800_SPEC);

    expect(sampleKseaSurface(defaultState.position).onRunway).toBe(false);
    expect(defaultState.ground.onRunway).toBe(true);
  });
});
