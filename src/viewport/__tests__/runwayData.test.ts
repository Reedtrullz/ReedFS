import { describe, expect, it } from 'vitest';
import {
  ENGM_AUTOLAND_APPROACH,
  ENGM_AUTOLAND_RUNWAY,
  ENGM_RUNWAYS,
  KPDX_RUNWAY_10R,
  KPDX_RUNWAY_10R_APPROACH,
  KPDX_RUNWAYS,
  KSEA_RUNWAY_16L,
  KSEA_RUNWAYS,
  NORWAY_AIRPORTS_WITH_SOURCE_RUNWAYS,
  NORWAY_RUNWAY_CATALOG_SOURCE,
  NORWAY_RUNWAYS,
  NORWAY_SOURCE_BACKED_RUNWAYS,
  SUPPORTED_RUNWAYS,
  orientedRunwayByAirportAndId,
  runwayByAirportAndId,
  runwayDepartureEnd,
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

function distanceM(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  return distanceNm(from, to) * M_PER_NM;
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

  it('exports ENVA, ENGM, KSEA and KPDX references as supported runways', () => {
    expect(SUPPORTED_RUNWAYS).toEqual([...NORWAY_RUNWAYS, ...KSEA_RUNWAYS, ...KPDX_RUNWAYS]);
  });

  it('includes the generated Norwegian runway catalog with source-count metadata', () => {
    expect(NORWAY_RUNWAY_CATALOG_SOURCE).toMatchObject({
      sourceName: 'OurAirports',
      sourceCommit: 'fe021a6f396a72f73cbaa160a710ef96f7fb21bf',
      sourceCommitDate: '2026-06-17T01:53:12Z',
      airportsUrl: expect.stringMatching(/raw\.githubusercontent\.com\/davidmegginson\/ourairports-data\/[a-f0-9]{40}\/airports\.csv$/),
      runwaysUrl: expect.stringMatching(/raw\.githubusercontent\.com\/davidmegginson\/ourairports-data\/[a-f0-9]{40}\/runways\.csv$/),
      airportsSha256: '698ded63e7d7df34a88db07872ac8c96abf6cb66cfea0d0716d6a513d6761abe',
      runwaysSha256: 'b262b5a2ea5bef298c25200a98964cd2803a67c660b707186f239690d685d369',
      isoCountry: 'NO/SJ',
      airportCount: 60,
      runwayCount: 63,
      excludedAirportTypes: ['closed', 'heliport', 'seaplane_base'],
    });
    expect(NORWAY_RUNWAY_CATALOG_SOURCE.airportsUrl).toContain(NORWAY_RUNWAY_CATALOG_SOURCE.sourceCommit);
    expect(NORWAY_RUNWAY_CATALOG_SOURCE.runwaysUrl).toContain(NORWAY_RUNWAY_CATALOG_SOURCE.sourceCommit);
    expect(NORWAY_SOURCE_BACKED_RUNWAYS).toHaveLength(NORWAY_RUNWAY_CATALOG_SOURCE.runwayCount);
    expect(NORWAY_RUNWAYS).toHaveLength(NORWAY_RUNWAY_CATALOG_SOURCE.runwayCount);
    expect(new Set(NORWAY_AIRPORTS_WITH_SOURCE_RUNWAYS).size).toBe(NORWAY_RUNWAY_CATALOG_SOURCE.airportCount);

    const runtimeAirports = new Set(NORWAY_RUNWAYS.map((runway) => runway.airport));
    for (const airport of NORWAY_AIRPORTS_WITH_SOURCE_RUNWAYS) {
      expect(runtimeAirports.has(airport)).toBe(true);
    }
  });

  it('keeps every supported Norwegian runway uniquely addressable by airport and primary id', () => {
    const keys = NORWAY_RUNWAYS.map((runway) => `${runway.airport}:${runway.id}`);

    expect(new Set(keys).size).toBe(keys.length);
    expect(runwayByAirportAndId('ENBR', '17')?.airport).toBe('ENBR');
    expect(runwayByAirportAndId('ENBR', '35')?.airport).toBe('ENBR');
    expect(runwayByAirportAndId('ENZV', '18')?.airport).toBe('ENZV');
  });

  it('derives source-backed Norwegian runway geometry from non-zero threshold endpoints', () => {
    for (const runway of NORWAY_SOURCE_BACKED_RUNWAYS) {
      expect(runway.coordinateSource).toBe('ourairports');
      expect(runway.sourceDataset).toBe('ourairports');
      expect(runway.sourceId).toMatch(/^\d+$/);
      expect(runway.sourceNote).toMatch(/OurAirports public-domain runway endpoint geometry/i);
      expect(runway.end).toBeDefined();
      expect(runway.start.lat).toBeGreaterThan(57);
      expect(runway.start.lat).toBeLessThan(80);
      expect(runway.start.lon).toBeGreaterThan(4);
      expect(runway.start.lon).toBeLessThan(32);
      expect(runway.end?.lat).toBeGreaterThan(57);
      expect(runway.end?.lat).toBeLessThan(80);
      expect(runway.end?.lon).toBeGreaterThan(4);
      expect(runway.end?.lon).toBeLessThan(32);
      expect(runway.headingDeg).toBeGreaterThanOrEqual(0);
      expect(runway.headingDeg).toBeLessThan(360);
      expect(runway.lengthM).toBeGreaterThan(500);
      expect(runway.widthM).toBeGreaterThan(5);
      expect(Math.abs(distanceM(runway.start, runway.end!) - runway.lengthM)).toBeLessThan(15);
      expect(bearingDeg(runway.start, runway.end!)).toBeCloseTo(runway.headingDeg, 0);
    }
  });

  it('finds KPDX 10R by primary and opposite runway ids', () => {
    const kpdx10R = KPDX_RUNWAYS.find((runway) => runway.id === '10R');

    expect(kpdx10R).toBeDefined();
    expect(runwayByAirportAndId('KPDX', '10R')).toBe(kpdx10R);
    expect(runwayByAirportAndId('KPDX', '28L')).toBe(kpdx10R);
  });

  it('resolves primary and opposite runway directions as oriented thresholds', () => {
    const enbr17 = orientedRunwayByAirportAndId('ENBR', '17');
    const enbr35 = orientedRunwayByAirportAndId('ENBR', '35');
    const source = runwayByAirportAndId('ENBR', '17');

    expect(source).toBeDefined();
    expect(enbr17).toBe(source);
    expect(enbr35).toBeDefined();
    expect(enbr35).not.toBe(source);
    expect(enbr35).toMatchObject({
      airport: 'ENBR',
      id: '35',
      oppositeId: '17',
      label: '35/17',
    });
    expect(enbr35?.start).toEqual(runwayDepartureEnd(source!));
    expect(enbr35?.end).toEqual(source!.start);
    expect(enbr35?.headingDeg).toBeCloseTo(normalizeDeg(source!.headingDeg + 180), 6);
  });

  it('keeps every supported primary and opposite runway end finite and individually addressable', () => {
    const seen = new Set<string>();

    for (const runway of SUPPORTED_RUNWAYS) {
      for (const runwayId of [runway.id, runway.oppositeId]) {
        const key = `${runway.airport}:${runwayId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const oriented = orientedRunwayByAirportAndId(runway.airport, runwayId);
        expect(oriented, key).toBeDefined();
        expect(oriented?.id, key).toBe(runwayId);
        expect(Number.isFinite(oriented?.start.lat), key).toBe(true);
        expect(Number.isFinite(oriented?.start.lon), key).toBe(true);
        expect(Number.isFinite(oriented?.headingDeg), key).toBe(true);
        expect(oriented!.headingDeg, key).toBeGreaterThanOrEqual(0);
        expect(oriented!.headingDeg, key).toBeLessThan(360);
      }
    }
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

  it('exports synthetic ENGM 19R fallback runway and approach points for autoland proof', () => {
    const approach = ENGM_AUTOLAND_APPROACH;

    expect(ENGM_RUNWAYS.map((runway) => runway.id)).toEqual(['19R', '19L']);
    expect(ENGM_AUTOLAND_RUNWAY).toMatchObject({
      airport: 'ENGM',
      id: '19R',
      oppositeId: '01L',
      coordinateSource: 'synthetic',
      sourceNote: expect.stringMatching(/fallback selected without Cesium visual verification/i),
    });
    expect(runwayByAirportAndId('ENGM', '19R')).toBe(ENGM_AUTOLAND_RUNWAY);
    expect(runwayByAirportAndId('ENGM', '01L')).toBe(ENGM_AUTOLAND_RUNWAY);
    expect(runwayByAirportAndId('ENGM', '19L')?.coordinateSource).toBe('ourairports');
    expect(approach).toMatchObject({
      airport: 'ENGM',
      runwayId: '19R',
      coordinateSource: 'synthetic',
      sourceNote: expect.stringMatching(/not official procedure/i),
    });
    expect(approach.initialApproachFix.ident).toBe('ENGM19R_IF');
    expect(approach.finalApproachFix.ident).toBe('ENGM19R_FAF');
    expect(approach.threshold.ident).toBe('ENGM19R_RWY');
    expect(approach.threshold.point).toEqual(ENGM_AUTOLAND_RUNWAY.start);
    expect(approach.initialApproachFix.point.altFt).toBe(3000);
    expect(approach.finalApproachFix.point.altFt).toBe(ENGM_AUTOLAND_RUNWAY.elevationFt + 1500);

    expect(distanceNm(approach.threshold.point, approach.finalApproachFix.point)).toBeCloseTo(5, 1);
    expect(distanceNm(approach.threshold.point, approach.initialApproachFix.point)).toBeCloseTo(12, 1);
    expect(bearingDeg(approach.finalApproachFix.point, approach.threshold.point)).toBeCloseTo(ENGM_AUTOLAND_RUNWAY.headingDeg, 0);
    expect(bearingDeg(approach.initialApproachFix.point, approach.threshold.point)).toBeCloseTo(ENGM_AUTOLAND_RUNWAY.headingDeg, 0);
  });
});
