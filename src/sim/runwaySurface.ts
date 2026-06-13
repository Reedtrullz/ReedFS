import type { GeoPosition } from './types';
import { KSEA_RUNWAYS, SUPPORTED_RUNWAYS, type RunwayReference, type SupportedAirport } from '../viewport/runwayData';

export type GroundSurfaceKind = 'runway' | 'offRunway' | 'unsupportedTerrain';

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
  runwayHalfWidthM?: number;
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
const UNSUPPORTED_TERRAIN_DISTANCE_M = 300_000;

interface NearestRunwayFootprint {
  runway: RunwayReference;
  distanceM: number;
  alongTrackM: number;
  lateralOffsetM: number;
}

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

function isWithinRunwayRectangle(
  runway: RunwayReference,
  alongTrackM: number,
  lateralOffsetM: number,
  longitudinalEdgeMarginM = RUNWAY_EDGE_MARGIN_M,
  lateralEdgeMarginM = RUNWAY_EDGE_MARGIN_M,
): boolean {
  return (
    alongTrackM >= -longitudinalEdgeMarginM &&
    alongTrackM <= runway.lengthM + longitudinalEdgeMarginM &&
    Math.abs(lateralOffsetM) <= runway.widthM / 2 + lateralEdgeMarginM
  );
}

export function isPositionOnPreparedRunwayFootprint(
  position: GeoPosition,
  lateralEdgeMarginM = 0,
  longitudinalEdgeMarginM = RUNWAY_EDGE_MARGIN_M,
  runways: readonly RunwayReference[] = SUPPORTED_RUNWAYS,
): boolean {
  return runways.some((runway) => {
    const { alongTrackM, lateralOffsetM } = runwayCoordinates(position, runway);
    return isWithinRunwayRectangle(runway, alongTrackM, lateralOffsetM, longitudinalEdgeMarginM, lateralEdgeMarginM);
  });
}

function nearestRunwayByFootprintDistance(position: GeoPosition, runways: readonly RunwayReference[]): NearestRunwayFootprint | undefined {
  let nearestRunway: RunwayReference | undefined;
  let nearestAlongTrackM = 0;
  let nearestLateralOffsetM = 0;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const runway of runways) {
    const { alongTrackM, lateralOffsetM } = runwayCoordinates(position, runway);
    const clampedAlongTrackM = Math.max(0, Math.min(runway.lengthM, alongTrackM));
    const alongDistanceM = alongTrackM - clampedAlongTrackM;
    const distanceSq = alongDistanceM * alongDistanceM + lateralOffsetM * lateralOffsetM;
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearestRunway = runway;
      nearestAlongTrackM = alongTrackM;
      nearestLateralOffsetM = lateralOffsetM;
    }
  }

  return nearestRunway ? {
    runway: nearestRunway,
    distanceM: Math.sqrt(nearestDistanceSq),
    alongTrackM: nearestAlongTrackM,
    lateralOffsetM: nearestLateralOffsetM,
  } : undefined;
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
        runwayHalfWidthM: runway.widthM / 2,
      };
    }
  }

  const nearest = nearestRunwayByFootprintDistance(position, runways);

  if (!nearest || nearest.distanceM > UNSUPPORTED_TERRAIN_DISTANCE_M) {
    return {
      kind: 'unsupportedTerrain',
      onRunway: false,
      groundAltFt: position.alt,
      frictionScale: OFF_RUNWAY_FRICTION_SCALE,
    };
  }

  return {
    kind: 'offRunway',
    onRunway: false,
    groundAltFt: nearest.runway.elevationFt,
    frictionScale: OFF_RUNWAY_FRICTION_SCALE,
    airport: nearest.runway.airport,
    alongTrackM: nearest.alongTrackM,
    lateralOffsetM: nearest.lateralOffsetM,
    runwayHalfWidthM: nearest.runway.widthM / 2,
  };
}

export function sampleSupportedAirportSurface(position: GeoPosition): GroundSurfaceSample {
  return sampleRunwaySurface(position, SUPPORTED_RUNWAYS);
}

export function sampleKseaSurface(position: GeoPosition): GroundSurfaceSample {
  return sampleRunwaySurface(position, KSEA_RUNWAYS);
}
