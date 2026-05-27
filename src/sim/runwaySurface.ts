import type { GeoPosition } from './types';
import { KSEA_RUNWAYS, type RunwayReference } from '../viewport/runwayData';

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

export function sampleKseaSurface(position: GeoPosition): GroundSurfaceSample {
  for (const runway of KSEA_RUNWAYS) {
    const { alongTrackM, lateralOffsetM } = runwayCoordinates(position, runway);
    if (isWithinRunwayRectangle(runway, alongTrackM, lateralOffsetM)) {
      return {
        kind: 'runway',
        onRunway: true,
        groundAltFt: runway.elevationFt,
        frictionScale: RUNWAY_FRICTION_SCALE,
        runwayId: runway.id,
        alongTrackM,
        lateralOffsetM,
      };
    }
  }

  return {
    kind: 'offRunway',
    onRunway: false,
    groundAltFt: KSEA_FALLBACK_ELEVATION_FT,
    frictionScale: OFF_RUNWAY_FRICTION_SCALE,
  };
}
