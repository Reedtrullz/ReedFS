export interface RunwayGeoPoint {
  lat: number;
  lon: number;
  altFt: number;
}

export type SupportedAirport = 'ENVA' | 'KSEA' | 'KPDX';

const FT_TO_M = 0.3048;

export interface RunwayReference {
  airport: SupportedAirport;
  id: string;
  oppositeId: string;
  label: string;
  start: RunwayGeoPoint;
  headingDeg: number;
  elevationFt: number;
  lengthM: number;
  widthM: number;
}

// ── ENVA (Trondheim Værnes) ────────────────────────────────────────────
// Single physical runway 09/27. Default airport for all scenarios.
// `start` is the 09 threshold; runway extends 2999 m at heading 090°.
// Opposite-direction 27 ops resolve through `oppositeId` and the
// reciprocal heading (270°).
// Coordinates visually aligned against Cesium Bing Maps imagery.
export const ENVA_RUNWAY_09: RunwayReference = {
  airport: 'ENVA',
  id: '09',
  oppositeId: '27',
  label: '09/27',
  start: { lat: 63.45767, lon: 10.88648, altFt: 56 },
  headingDeg: 90,
  elevationFt: 56,
  lengthM: 2999,
  widthM: 45,
};

// ── KSEA (Seattle-Tacoma) ──────────────────────────────────────────────
export const KSEA_RUNWAY_16L: RunwayReference = {
  airport: 'KSEA',
  id: '16L',
  oppositeId: '34R',
  label: '16L/34R',
  start: { lat: 47.4780, lon: -122.2914, altFt: 432 },
  headingDeg: 163,
  elevationFt: 432,
  lengthM: 3627,
  widthM: 46,
};

export const KSEA_RUNWAY_16C: RunwayReference = {
  airport: 'KSEA',
  id: '16C',
  oppositeId: '34C',
  label: '16C/34C',
  start: { lat: 47.4709, lon: -122.3020, altFt: 356 },
  headingDeg: 163,
  elevationFt: 356,
  lengthM: 2865,
  widthM: 46,
};

export const KSEA_RUNWAY_16R: RunwayReference = {
  airport: 'KSEA',
  id: '16R',
  oppositeId: '34L',
  label: '16R/34L',
  start: { lat: 47.4647, lon: -122.3100, altFt: 350 },
  headingDeg: 163,
  elevationFt: 350,
  lengthM: 2591,
  widthM: 46,
};

export const KPDX_RUNWAY_10L: RunwayReference = {
  airport: 'KPDX',
  id: '10L',
  oppositeId: '28R',
  label: '10L/28R',
  start: { lat: 45.596537, lon: -122.600062, altFt: 29 },
  headingDeg: 119,
  elevationFt: 29,
  lengthM: 9825 * FT_TO_M,
  widthM: 150 * FT_TO_M,
};

export const KPDX_RUNWAY_10R: RunwayReference = {
  airport: 'KPDX',
  id: '10R',
  oppositeId: '28L',
  label: '10R/28L',
  start: { lat: 45.595155, lon: -122.62151, altFt: 22 },
  headingDeg: 119,
  elevationFt: 22,
  lengthM: 11000 * FT_TO_M,
  widthM: 150 * FT_TO_M,
};

export const KPDX_RUNWAY_03: RunwayReference = {
  airport: 'KPDX',
  id: '03',
  oppositeId: '21',
  label: '03/21',
  start: { lat: 45.582405, lon: -122.616856, altFt: 22 },
  headingDeg: 45,
  elevationFt: 22,
  lengthM: 6000 * FT_TO_M,
  widthM: 150 * FT_TO_M,
};

export const ENVA_RUNWAYS: RunwayReference[] = [ENVA_RUNWAY_09];
export const KSEA_RUNWAYS: RunwayReference[] = [KSEA_RUNWAY_16L, KSEA_RUNWAY_16C, KSEA_RUNWAY_16R];
export const KPDX_RUNWAYS: RunwayReference[] = [KPDX_RUNWAY_10L, KPDX_RUNWAY_10R, KPDX_RUNWAY_03];
export const SUPPORTED_RUNWAYS: RunwayReference[] = [...ENVA_RUNWAYS, ...KSEA_RUNWAYS, ...KPDX_RUNWAYS];

export function runwayByAirportAndId(airport: string, runwayId: string): RunwayReference | undefined {
  return SUPPORTED_RUNWAYS.find(
    (runway) => runway.airport === airport && (runway.id === runwayId || runway.oppositeId === runwayId),
  );
}
