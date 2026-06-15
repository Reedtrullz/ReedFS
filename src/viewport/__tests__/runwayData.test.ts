import { describe, expect, it } from 'vitest';
import {
  ENVA_RUNWAYS,
  KPDX_RUNWAY_10R,
  KPDX_RUNWAY_10R_APPROACH,
  KPDX_RUNWAYS,
  KSEA_RUNWAY_16L,
  KSEA_RUNWAYS,
  SUPPORTED_RUNWAYS,
  runwayByAirportAndId,
} from '../runwayData';

const EARTH_RADIUS_M = 6371000;
const M_PER_NM = 1852;

function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

function normalizeDeg(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function distanceNm(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const meanLat = toRad((from.lat + to.lat) / 2);
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  return Math.hypot(dLon * Math.cos(meanLat), dLat) * EARTH_RADIUS_M / M_PER_NM;
}

function bearingDeg(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const meanLat = toRad((from.lat + to.lat) / 2);
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  return normalizeDeg(Math.atan2(dLon * Math.cos(meanLat), dLat) * 180 / Math.PI);
}

describe('runwayData', () => {
  it('preserves the KSEA runway catalog', () => {
    expect(KSEA_RUNWAYS).toHaveLength(3);
    expect(KSEA_RUNWAYS).toContain(KSEA_RUNWAY_16L);
    expect(KSEA_RUNWAYS.map((runway) => runway.id)).toEqual(['16L', '16C', '16R']);
    expect(runwayByAirportAndId('KSEA', '16L')).toBe(KSEA_RUNWAY_16L);
  });

  it('adds the KPDX runway catalog', () => {
    expect(KPDX_RUNWAYS).toHaveLength(3);
    expect(KPDX_RUNWAYS.map((runway) => runway.id)).toEqual(['10L', '10R', '03']);
    expect(KPDX_RUNWAYS.map((runway) => runway.oppositeId)).toEqual(['28R', '28L', '21']);
  });

  it('exports ENVA, KSEA and KPDX references as supported runways', () => {
    expect(SUPPORTED_RUNWAYS).toEqual([...ENVA_RUNWAYS, ...KSEA_RUNWAYS, ...KPDX_RUNWAYS]);
  });

  it('finds KPDX 10R by primary and opposite runway ids', () => {
    const kpdx10R = KPDX_RUNWAYS.find((runway) => runway.id === '10R');

    expect(kpdx10R).toBeDefined();
    expect(runwayByAirportAndId('KPDX', '10R')).toBe(kpdx10R);
    expect(runwayByAirportAndId('KPDX', '28L')).toBe(kpdx10R);
  });

  it('exports synthetic KPDX 10R approach points tied to the runway threshold and final course', () => {
    const approach = KPDX_RUNWAY_10R_APPROACH;

    expect(approach).toMatchObject({
      airport: 'KPDX',
      runwayId: '10R',
      coordinateSource: 'synthetic',
      sourceNote: expect.stringMatching(/synthetic training fixture/i),
    });
    expect(approach.initialApproachFix.ident).toBe('KPDX10R_IF');
    expect(approach.finalApproachFix.ident).toBe('KPDX10R_FAF');
    expect(approach.threshold.ident).toBe('KPDX10R_RWY');
    expect(approach.threshold.point).toEqual(KPDX_RUNWAY_10R.start);
    expect(approach.initialApproachFix.point.altFt).toBe(3000);
    expect(approach.finalApproachFix.point.altFt).toBe(KPDX_RUNWAY_10R.elevationFt + 1500);

    expect(distanceNm(approach.threshold.point, approach.finalApproachFix.point)).toBeCloseTo(5, 1);
    expect(distanceNm(approach.threshold.point, approach.initialApproachFix.point)).toBeCloseTo(12, 1);
    expect(bearingDeg(approach.finalApproachFix.point, approach.threshold.point)).toBeCloseTo(KPDX_RUNWAY_10R.headingDeg, 0);
    expect(bearingDeg(approach.initialApproachFix.point, approach.threshold.point)).toBeCloseTo(KPDX_RUNWAY_10R.headingDeg, 0);
  });
});
