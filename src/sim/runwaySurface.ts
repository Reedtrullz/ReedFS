import type { GeoPosition } from './types';
import { KSEA_RUNWAYS, SUPPORTED_RUNWAYS, type RunwayReference, type SupportedAirport } from '../viewport/runwayData';

export type GroundSurfaceKind = 'runway' | 'offRunway';

export interface GroundSurfaceFrictionScale {
  rolling: number;
  brake: number;
  side: number;
}

export interface GroundSurfaceSample {
  kind: GroundSurfaceKind;
  onRunway: boolean;
  groundAltFt: number;
  frictionScale: GroundSurfaceFrictionScale;
  airport?: SupportedAirport;
  runwayId?: string;
  alongTrackM?: number;
  lateralOffsetM?: number;
}

export const RUNWAY_FRICTION_SCALE: GroundSurfaceFrictionScale = {
  rolling: 1,
  brake: 1,
  side: 1,
};

export const OFF_RUNWAY_FRICTION_SCALE: GroundSurfaceFrictionScale = {
  rolling: 3,
  brake: 0.45,
  side: 0.55,
};

const RUNWAY_EDGE_MARGIN_M = 3;
const KSEA_FALLBACK_ELEVATION_FT = 432;

function localNorthEastMeters(position: GeoPosition, origin: RunwayReference['start']): { northM: number; eastM: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(origin.lat * Math.PI / 180);
  return {
    northM: (position.lat - origin.lat) * metersPerDegreeLat,
    eastM: (position.lon - origin.lon) * metersPerDegreeLon,
  };
}

function runwayCoordinates(position: GeoPosition, runway: RunwayReference): { alongTrackM: number; lateralOffsetM: number } {
  const { northM, eastM } = localNorthEastMeters(position, runway.start);
  const headingRad = runway.headingDeg * Math.PI / 180;
  return {
    alongTrackM: northM * Math.cos(headingRad) + eastM * Math.sin(headingRad),
    lateralOffsetM: -northM * Math.sin(headingRad) + eastM * Math.cos(headingRad),
  };
}

function isWithinRunwayRectangle(runway: RunwayReference, alongTrackM: number, lateralOffsetM: number): boolean {
  return (
    alongTrackM >= -RUNWAY_EDGE_MARGIN_M &&
    alongTrackM <= runway.lengthM + RUNWAY_EDGE_MARGIN_M &&
    Math.abs(lateralOffsetM) <= runway.widthM / 2 + RUNWAY_EDGE_MARGIN_M
  );
}

function nearestRunwayByFootprintDistance(position: GeoPosition, runways: readonly RunwayReference[]): RunwayReference | undefined {
  let nearestRunway: RunwayReference | undefined;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const runway of runways) {
    const { alongTrackM, lateralOffsetM } = runwayCoordinates(position, runway);
    const clampedAlongTrackM = Math.max(0, Math.min(runway.lengthM, alongTrackM));
    const alongDistanceM = alongTrackM - clampedAlongTrackM;
    const distanceSq = alongDistanceM * alongDistanceM + lateralOffsetM * lateralOffsetM;
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearestRunway = runway;
    }
  }

  return nearestRunway;
}

function sampleRunwaySurface(position: GeoPosition, runways: readonly RunwayReference[]): GroundSurfaceSample {
  for (const runway of runways) {
    const { alongTrackM, lateralOffsetM } = runwayCoordinates(position, runway);
    if (isWithinRunwayRectangle(runway, alongTrackM, lateralOffsetM)) {
      return {
        kind: 'runway',
        onRunway: true,
        groundAltFt: runway.elevationFt,
        frictionScale: RUNWAY_FRICTION_SCALE,
        airport: runway.airport,
        runwayId: runway.id,
        alongTrackM,
        lateralOffsetM,
      };
    }
  }

  const nearestRunway = nearestRunwayByFootprintDistance(position, runways);

  return {
    kind: 'offRunway',
    onRunway: false,
    groundAltFt: nearestRunway?.elevationFt ?? KSEA_FALLBACK_ELEVATION_FT,
    frictionScale: OFF_RUNWAY_FRICTION_SCALE,
    airport: nearestRunway?.airport,
  };
}

export function sampleSupportedAirportSurface(position: GeoPosition): GroundSurfaceSample {
  return sampleRunwaySurface(position, SUPPORTED_RUNWAYS);
}

export function sampleKseaSurface(position: GeoPosition): GroundSurfaceSample {
  return sampleRunwaySurface(position, KSEA_RUNWAYS);
}
