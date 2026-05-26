import { useEffect, type RefObject } from 'react';
import * as Cesium from 'cesium';
import { isCesiumResourceDestroyed } from './cesiumLifecycle';
import { KSEA_RUNWAYS, KSEA_RUNWAY_16L, type RunwayGeoPoint, type RunwayReference } from './runwayData';

export interface RunwayLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
}

type AddedEntity = ReturnType<Cesium.EntityCollection['add']>;

const METERS_PER_DEG_LAT = 111_320;
const RUNWAY_ALTITUDE_OFFSET_M = 0.15;

function offsetPoint(origin: RunwayGeoPoint, northM: number, eastM: number): RunwayGeoPoint {
  const lat = origin.lat + northM / METERS_PER_DEG_LAT;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(origin.lat * Math.PI / 180);
  const lon = origin.lon + eastM / metersPerDegLon;
  return { lat, lon, altFt: origin.altFt };
}

function forwardRightVectors(headingDeg: number) {
  const headingRad = Cesium.Math.toRadians(headingDeg);
  const forward = { north: Math.cos(headingRad), east: Math.sin(headingRad) };
  const right = { north: Math.cos(headingRad + Math.PI / 2), east: Math.sin(headingRad + Math.PI / 2) };
  return { forward, right };
}

function pointAlongRunway(runway: RunwayReference, alongM: number, lateralM = 0): RunwayGeoPoint {
  const { forward, right } = forwardRightVectors(runway.headingDeg);
  return offsetPoint(
    runway.start,
    forward.north * alongM + right.north * lateralM,
    forward.east * alongM + right.east * lateralM,
  );
}

function cartesian(point: RunwayGeoPoint, extraAltM = RUNWAY_ALTITUDE_OFFSET_M): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.altFt * 0.3048 + extraAltM);
}

function polygonHierarchy(points: RunwayGeoPoint[]): Cesium.Cartesian3[] {
  return Cesium.Cartesian3.fromDegreesArrayHeights(
    points.flatMap((point) => [point.lon, point.lat, point.altFt * 0.3048 + RUNWAY_ALTITUDE_OFFSET_M]),
  );
}

function runwayRectangle(runway: RunwayReference, startAlongM = 0, endAlongM = runway.lengthM, halfWidthM = runway.widthM / 2): RunwayGeoPoint[] {
  return [
    pointAlongRunway(runway, startAlongM, -halfWidthM),
    pointAlongRunway(runway, startAlongM, halfWidthM),
    pointAlongRunway(runway, endAlongM, halfWidthM),
    pointAlongRunway(runway, endAlongM, -halfWidthM),
  ];
}

function addRunwayEntities(viewer: Cesium.Viewer, runway: RunwayReference): AddedEntity[] {
  const entities: AddedEntity[] = [];
  const add = (entity: Parameters<Cesium.EntityCollection['add']>[0]) => {
    entities.push(viewer.entities.add(entity));
  };

  add({
    id: `runway-pavement-${runway.airport}-${runway.id}`,
    name: `${runway.airport} runway ${runway.label} pavement`,
    polygon: {
      hierarchy: polygonHierarchy(runwayRectangle(runway)),
      material: Cesium.Color.DARKGRAY.withAlpha(0.82),
    },
  });

  add({
    id: `runway-centerline-${runway.airport}-${runway.id}`,
    name: `${runway.airport} runway ${runway.label} centerline`,
    polyline: {
      positions: [cartesian(pointAlongRunway(runway, 120), 0.35), cartesian(pointAlongRunway(runway, runway.lengthM - 120), 0.35)],
      width: 2,
      material: Cesium.Color.WHITE.withAlpha(0.92),
    },
  });

  const startLeft = pointAlongRunway(runway, 25, -runway.widthM / 2);
  const startRight = pointAlongRunway(runway, 25, runway.widthM / 2);
  const endLeft = pointAlongRunway(runway, runway.lengthM - 25, -runway.widthM / 2);
  const endRight = pointAlongRunway(runway, runway.lengthM - 25, runway.widthM / 2);
  add({
    id: `runway-threshold-${runway.airport}-${runway.id}-start`,
    polyline: { positions: [cartesian(startLeft, 0.4), cartesian(startRight, 0.4)], width: 5, material: Cesium.Color.WHITE },
  });
  add({
    id: `runway-threshold-${runway.airport}-${runway.id}-end`,
    polyline: { positions: [cartesian(endLeft, 0.4), cartesian(endRight, 0.4)], width: 5, material: Cesium.Color.WHITE },
  });

  add({
    id: `runway-number-${runway.airport}-${runway.id}-start`,
    position: cartesian(pointAlongRunway(runway, 130), 1),
    label: {
      text: runway.id,
      fillColor: Cesium.Color.WHITE,
      pixelOffset: new Cesium.Cartesian2(0, 0),
      scale: 0.7,
    },
  });
  add({
    id: `runway-number-${runway.airport}-${runway.id}-end`,
    position: cartesian(pointAlongRunway(runway, runway.lengthM - 130), 1),
    label: {
      text: runway.oppositeId,
      fillColor: Cesium.Color.WHITE,
      pixelOffset: new Cesium.Cartesian2(0, 0),
      scale: 0.7,
    },
  });

  for (let i = 0; i <= 8; i += 1) {
    const along = (runway.lengthM * i) / 8;
    (['L', 'R'] as const).forEach((side) => {
      const lateral = side === 'L' ? -runway.widthM / 2 - 5 : runway.widthM / 2 + 5;
      add({
        id: `runway-edge-light-${runway.airport}-${runway.id}-${side}${i}`,
        position: cartesian(pointAlongRunway(runway, along, lateral), 0.7),
        point: { pixelSize: 4, color: Cesium.Color.WHITE.withAlpha(0.9) },
      });
    });
  }

  [180, 330, 480].forEach((along, index) => {
    add({
      id: `runway-touchdown-${runway.airport}-${runway.id}-start-${index}`,
      polygon: {
        hierarchy: polygonHierarchy(runwayRectangle(runway, along, along + 42, runway.widthM * 0.18)),
        material: Cesium.Color.WHITE.withAlpha(0.85),
      },
    });
  });

  return entities;
}

function addAirportContext(viewer: Cesium.Viewer): AddedEntity[] {
  const entities: AddedEntity[] = [];
  const add = (entity: Parameters<Cesium.EntityCollection['add']>[0]) => {
    entities.push(viewer.entities.add(entity));
  };
  const runway = KSEA_RUNWAY_16L;

  add({
    id: 'taxiway-reference-KSEA-main',
    polyline: {
      positions: [
        cartesian(pointAlongRunway(runway, 250, runway.widthM / 2 + 65), 0.25),
        cartesian(pointAlongRunway(runway, runway.lengthM - 400, runway.widthM / 2 + 65), 0.25),
      ],
      width: 10,
      material: Cesium.Color.YELLOW.withAlpha(0.65),
    },
  });

  const apronCenter = pointAlongRunway(runway, 720, runway.widthM / 2 + 210);
  add({
    id: 'apron-reference-KSEA-main',
    polygon: {
      hierarchy: polygonHierarchy([
        offsetPoint(apronCenter, -120, -180),
        offsetPoint(apronCenter, -120, 180),
        offsetPoint(apronCenter, 140, 180),
        offsetPoint(apronCenter, 140, -180),
      ]),
      material: Cesium.Color.GRAY.withAlpha(0.42),
    },
  });

  return entities;
}

export function RunwayLayer({ viewerRef }: RunwayLayerProps) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const created = [
      ...KSEA_RUNWAYS.flatMap((runway) => addRunwayEntities(viewer, runway)),
      ...addAirportContext(viewer),
    ];

    return () => {
      if (isCesiumResourceDestroyed(viewer)) return;
      created.forEach((entity) => {
        viewer.entities.remove(entity);
      });
    };
  }, [viewerRef]);

  return null;
}
