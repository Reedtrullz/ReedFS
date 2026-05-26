export interface RunwayGeoPoint {
  lat: number;
  lon: number;
  altFt: number;
}

export interface RunwayReference {
  airport: 'KSEA';
  id: string;
  oppositeId: string;
  label: string;
  start: RunwayGeoPoint;
  headingDeg: number;
  elevationFt: number;
  lengthM: number;
  widthM: number;
}

export const KSEA_RUNWAY_16L: RunwayReference = {
  airport: 'KSEA',
  id: '16L',
  oppositeId: '34R',
  label: '16L/34R',
  start: { lat: 47.45, lon: -122.301, altFt: 432 },
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
  start: { lat: 47.447, lon: -122.31, altFt: 432 },
  headingDeg: 163,
  elevationFt: 432,
  lengthM: 2865,
  widthM: 46,
};

export const KSEA_RUNWAY_16R: RunwayReference = {
  airport: 'KSEA',
  id: '16R',
  oppositeId: '34L',
  label: '16R/34L',
  start: { lat: 47.443, lon: -122.318, altFt: 432 },
  headingDeg: 163,
  elevationFt: 432,
  lengthM: 2591,
  widthM: 46,
};

export const KSEA_RUNWAYS: RunwayReference[] = [KSEA_RUNWAY_16L, KSEA_RUNWAY_16C, KSEA_RUNWAY_16R];

export function runwayByAirportAndId(airport: string, runwayId: string): RunwayReference | undefined {
  return KSEA_RUNWAYS.find((runway) => runway.airport === airport && runway.id === runwayId);
}
