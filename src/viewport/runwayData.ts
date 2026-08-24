import {
  NORWAY_AIRPORT_IDENTS,
  NORWAY_RUNWAY_ROWS,
  NORWAY_RUNWAY_SOURCE,
  NORWAY_RUNWAY_SOURCE_NOTE,
  type NorwayRunwayRow,
} from './norwayRunwayData.generated';

export interface RunwayGeoPoint {
  lat: number;
  lon: number;
  altFt: number;
}

export type SupportedAirport = string;

const FT_TO_M = 0.3048;
const M_PER_NM = 1852;
const EARTH_RADIUS_M = 6371000;
const METERS_PER_DEG_LAT = 111_320;

export interface RunwayReference {
  airport: SupportedAirport;
  id: string;
  oppositeId: string;
  label: string;
  start: RunwayGeoPoint;
  end?: RunwayGeoPoint;
  headingDeg: number;
  elevationFt: number;
  lengthM: number;
  widthM: number;
  coordinateSource?: 'synthetic' | 'ourairports';
  sourceDataset?: 'ourairports';
  sourceId?: string;
  sourceNote?: string;
}

export interface RunwayApproachFixReference {
  ident: string;
  point: RunwayGeoPoint;
  distanceNmFromThreshold: number;
  speedKt: number;
}

export interface RunwayThresholdApproachReference {
  ident: string;
  point: RunwayGeoPoint;
  speedKt: number;
}

export interface RunwayApproachReference {
  airport: SupportedAirport;
  runwayId: string;
  coordinateSource: 'synthetic';
  sourceNote: string;
  initialApproachFix: RunwayApproachFixReference;
  finalApproachFix: RunwayApproachFixReference;
  threshold: RunwayThresholdApproachReference;
}

function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

function toDeg(radians: number): number {
  return radians * 180 / Math.PI;
}

function normalizeLon(degrees: number): number {
  return ((degrees + 540) % 360) - 180;
}

function roundedCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeHeadingDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

function offsetPointMeters(origin: RunwayGeoPoint, northM: number, eastM: number): RunwayGeoPoint {
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(origin.lat * Math.PI / 180);
  return {
    lat: roundedCoordinate(origin.lat + northM / METERS_PER_DEG_LAT),
    lon: roundedCoordinate(origin.lon + eastM / metersPerDegLon),
    altFt: origin.altFt,
  };
}

export function runwayDepartureEnd(runway: RunwayReference): RunwayGeoPoint {
  if (runway.end) return runway.end;
  const headingRad = runway.headingDeg * Math.PI / 180;
  return offsetPointMeters(
    runway.start,
    Math.cos(headingRad) * runway.lengthM,
    Math.sin(headingRad) * runway.lengthM,
  );
}

function pointFromRunwayThreshold(runway: RunwayReference, distanceNmBeforeThreshold: number, altFt: number): RunwayGeoPoint {
  const angularDistance = distanceNmBeforeThreshold * M_PER_NM / EARTH_RADIUS_M;
  const bearing = toRad(runway.headingDeg + 180);
  const lat1 = toRad(runway.start.lat);
  const lon1 = toRad(runway.start.lon);
  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngular = Math.sin(angularDistance);
  const cosAngular = Math.cos(angularDistance);
  const lat2 = Math.asin(sinLat1 * cosAngular + cosLat1 * sinAngular * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * sinAngular * cosLat1,
    cosAngular - sinLat1 * Math.sin(lat2),
  );

  return {
    lat: roundedCoordinate(toDeg(lat2)),
    lon: roundedCoordinate(normalizeLon(toDeg(lon2))),
    altFt,
  };
}

function norwayRunwayFromRow(row: NorwayRunwayRow): RunwayReference {
  const [
    sourceId,
    airport,
    id,
    oppositeId,
    lat,
    lon,
    endLat,
    endLon,
    altFt,
    headingDeg,
    lengthM,
    widthM,
  ] = row;
  return {
    airport,
    id,
    oppositeId,
    label: `${id}/${oppositeId}`,
    start: { lat, lon, altFt },
    end: { lat: endLat, lon: endLon, altFt },
    headingDeg,
    elevationFt: altFt,
    lengthM,
    widthM,
    coordinateSource: 'ourairports',
    sourceDataset: 'ourairports',
    sourceId,
    sourceNote: NORWAY_RUNWAY_SOURCE_NOTE,
  };
}

const SOURCE_BACKED_NORWAY_RUNWAYS: RunwayReference[] = NORWAY_RUNWAY_ROWS.map(norwayRunwayFromRow);

function sourceBackedNorwayRunwaysForAirport(airport: string, excludedRunwayIds: readonly string[] = []): RunwayReference[] {
  const excluded = new Set(excludedRunwayIds);
  return SOURCE_BACKED_NORWAY_RUNWAYS.filter((runway) => runway.airport === airport && !excluded.has(runway.id));
}

function sourceBackedNorwayRunwaysExcludingAirports(airports: readonly string[]): RunwayReference[] {
  const excludedAirports = new Set(airports);
  return SOURCE_BACKED_NORWAY_RUNWAYS.filter((runway) => !excludedAirports.has(runway.airport));
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

// ── ENGM (Oslo Gardermoen) ─────────────────────────────────────────────
// Private southbound-parallel candidates for the first ENVA→ENGM autoland
// fixture. Both fixtures are synthetic RFS training data and must not be
// treated as official runway/procedure data.
const ENGM_RUNWAY_19R_SYNTHETIC_CANDIDATE: RunwayReference = {
  airport: 'ENGM',
  id: '19R',
  oppositeId: '01L',
  label: '01L/19R',
  start: { lat: 60.216067, lon: 11.091664, altFt: 675 },
  headingDeg: 193.9,
  elevationFt: 675,
  lengthM: 3600,
  widthM: 45,
  coordinateSource: 'synthetic',
  sourceNote: 'Synthetic ENGM 19R training fixture fallback selected without Cesium visual verification; not official runway or procedure data.',
};

const ENGM_RUNWAY_19L_SYNTHETIC_CANDIDATE: RunwayReference = {
  airport: 'ENGM',
  id: '19L',
  oppositeId: '01R',
  label: '01R/19L',
  start: { lat: 60.201208, lon: 11.122486, altFt: 670 },
  headingDeg: 193.9,
  elevationFt: 670,
  lengthM: 2950,
  widthM: 45,
  coordinateSource: 'synthetic',
  sourceNote: 'Synthetic ENGM 19L visual-fit candidate retained for RFS comparison only; not official runway or procedure data.',
};

const ENGM_19_PARALLEL_SYNTHETIC_CANDIDATES: readonly RunwayReference[] = [
  ENGM_RUNWAY_19R_SYNTHETIC_CANDIDATE,
  ENGM_RUNWAY_19L_SYNTHETIC_CANDIDATE,
];

export const ENGM_AUTOLAND_RUNWAY: RunwayReference = ENGM_19_PARALLEL_SYNTHETIC_CANDIDATES[0];

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

export const KPDX_RUNWAY_10R_APPROACH: RunwayApproachReference = {
  airport: KPDX_RUNWAY_10R.airport,
  runwayId: KPDX_RUNWAY_10R.id,
  coordinateSource: 'synthetic',
  sourceNote: 'Synthetic training fixture for RFS route handoff only; not official procedure data.',
  initialApproachFix: {
    ident: 'KPDX10R_IF',
    point: pointFromRunwayThreshold(KPDX_RUNWAY_10R, 12, 3000),
    distanceNmFromThreshold: 12,
    speedKt: 210,
  },
  finalApproachFix: {
    ident: 'KPDX10R_FAF',
    point: pointFromRunwayThreshold(KPDX_RUNWAY_10R, 5, KPDX_RUNWAY_10R.elevationFt + 1500),
    distanceNmFromThreshold: 5,
    speedKt: 138,
  },
  threshold: {
    ident: 'KPDX10R_RWY',
    point: { ...KPDX_RUNWAY_10R.start },
    speedKt: 138,
  },
};

export const ENGM_AUTOLAND_APPROACH: RunwayApproachReference = {
  airport: ENGM_AUTOLAND_RUNWAY.airport,
  runwayId: ENGM_AUTOLAND_RUNWAY.id,
  coordinateSource: 'synthetic',
  sourceNote: 'Synthetic ENGM 19R autoland fixture for RFS ENVA route handoff only; not official procedure data.',
  initialApproachFix: {
    ident: 'ENGM19R_IF',
    point: pointFromRunwayThreshold(ENGM_AUTOLAND_RUNWAY, 12, 3000),
    distanceNmFromThreshold: 12,
    speedKt: 210,
  },
  finalApproachFix: {
    ident: 'ENGM19R_FAF',
    point: pointFromRunwayThreshold(ENGM_AUTOLAND_RUNWAY, 5, ENGM_AUTOLAND_RUNWAY.elevationFt + 1500),
    distanceNmFromThreshold: 5,
    speedKt: 140,
  },
  threshold: {
    ident: 'ENGM19R_RWY',
    point: { ...ENGM_AUTOLAND_RUNWAY.start },
    speedKt: 140,
  },
};

export const NORWAY_RUNWAY_CATALOG_SOURCE = NORWAY_RUNWAY_SOURCE;
export const NORWAY_SOURCE_BACKED_RUNWAYS: RunwayReference[] = SOURCE_BACKED_NORWAY_RUNWAYS;
export const NORWAY_AIRPORTS_WITH_SOURCE_RUNWAYS: readonly string[] = NORWAY_AIRPORT_IDENTS;

export const ENVA_RUNWAYS: RunwayReference[] = [
  ENVA_RUNWAY_09,
  ...sourceBackedNorwayRunwaysForAirport('ENVA', [ENVA_RUNWAY_09.id]),
];
export const ENGM_RUNWAYS: RunwayReference[] = [
  ENGM_AUTOLAND_RUNWAY,
  ...sourceBackedNorwayRunwaysForAirport('ENGM', [ENGM_AUTOLAND_RUNWAY.id]),
];
export const NORWAY_RUNWAYS: RunwayReference[] = [
  ...ENVA_RUNWAYS,
  ...ENGM_RUNWAYS,
  ...sourceBackedNorwayRunwaysExcludingAirports(['ENVA', 'ENGM']),
];
export const KSEA_RUNWAYS: RunwayReference[] = [KSEA_RUNWAY_16L, KSEA_RUNWAY_16C, KSEA_RUNWAY_16R];
export const KPDX_RUNWAYS: RunwayReference[] = [KPDX_RUNWAY_10L, KPDX_RUNWAY_10R, KPDX_RUNWAY_03];
export const SUPPORTED_RUNWAYS: RunwayReference[] = [...NORWAY_RUNWAYS, ...KSEA_RUNWAYS, ...KPDX_RUNWAYS];

export function runwayByAirportAndId(airport: string, runwayId: string): RunwayReference | undefined {
  return SUPPORTED_RUNWAYS.find(
    (runway) => runway.airport === airport && (runway.id === runwayId || runway.oppositeId === runwayId),
  );
}

export function orientedRunwayByAirportAndId(airport: string, runwayId: string): RunwayReference | undefined {
  const runway = runwayByAirportAndId(airport, runwayId);
  if (!runway) return undefined;
  if (runway.id === runwayId) return runway;
  if (runway.oppositeId !== runwayId) return undefined;
  return {
    ...runway,
    id: runway.oppositeId,
    oppositeId: runway.id,
    label: `${runway.oppositeId}/${runway.id}`,
    start: runwayDepartureEnd(runway),
    end: runway.start,
    headingDeg: normalizeHeadingDeg(runway.headingDeg + 180),
  };
}
