import { cleanup, render } from '@testing-library/react';
import type { RefObject } from 'react';
import * as Cesium from 'cesium';
import ThreeToCesium from 'three-to-cesium';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KSEA_TUTORIAL_SCENARIO, KSEA_LIGHT_PATTERN_SCENARIO } from '../../sim/scenarios';
import { RunwayLayer } from '../RunwayLayer';
import { KSEA_RUNWAY_16L, KSEA_RUNWAYS, NORWAY_RUNWAYS } from '../runwayData';

vi.mock('three-to-cesium', () => ({
  default: vi.fn(),
}));

type Entity = { id?: string; [key: string]: unknown };
type PolylineEntity = Entity & { polyline?: { positions?: Cesium.Cartesian3[] } };

type TestViewer = {
  isDestroyed?: () => boolean;
  entities: {
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
};

function createViewerRef() {
  const added: Entity[] = [];
  const viewer: TestViewer = {
    entities: {
      add: vi.fn((entity: Entity) => {
        added.push(entity);
        return entity;
      }),
      remove: vi.fn(),
    },
  };
  return { added, viewer, viewerRef: { current: viewer } as RefObject<TestViewer> };
}

function distanceM(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const earthRadiusM = 6371000;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(to.lon - from.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cartesianToGeo(point: Cesium.Cartesian3): { lat: number; lon: number } {
  const cartographic = Cesium.Cartographic.fromCartesian(point);
  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lon: Cesium.Math.toDegrees(cartographic.longitude),
  };
}

describe('RunwayLayer', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('adds KSEA runway reference entities using Cesium-native entities only', () => {
    const { added, viewerRef } = createViewerRef();

    render(<RunwayLayer viewerRef={viewerRef as never} />);

    expect(ThreeToCesium).not.toHaveBeenCalled();
    expect(added.map((entity) => entity.id)).toEqual(expect.arrayContaining([
      'runway-pavement-KSEA-16L',
      'runway-centerline-KSEA-16L',
      'runway-threshold-KSEA-16L-start',
      'runway-number-KSEA-16L-start',
      'runway-edge-light-KSEA-16L-L0',
      'runway-touchdown-KSEA-16L-start-0',
      'taxiway-reference-KSEA-main',
      'apron-reference-KSEA-main',
    ]));
    expect(added.map((entity) => entity.id)).toEqual(expect.arrayContaining([
      'runway-pavement-ENBR-17',
      'runway-centerline-ENBR-17',
      'runway-threshold-ENBR-17-start',
      'runway-number-ENBR-17-start',
    ]));
    expect(added.filter((entity) => String(entity.id).startsWith('taxiway-reference-KSEA'))).toHaveLength(1);
    expect(added.filter((entity) => String(entity.id).startsWith('apron-reference-KSEA'))).toHaveLength(1);
    expect(NORWAY_RUNWAYS.some((runway) => runway.airport === 'ENBR' && runway.id === '17')).toBe(true);
  });

  it('renders source-backed Norway centerlines from runway endpoint geometry', () => {
    const ensb = NORWAY_RUNWAYS.find((runway) => runway.airport === 'ENSB' && runway.id === '09');
    expect(ensb?.end).toBeDefined();
    const { added, viewerRef } = createViewerRef();

    render(<RunwayLayer viewerRef={viewerRef as never} />);

    const centerline = added.find((entity) => entity.id === 'runway-centerline-ENSB-09') as PolylineEntity | undefined;
    const positions = centerline?.polyline?.positions;
    expect(positions).toHaveLength(2);
    const renderedStart = cartesianToGeo(positions![0]);
    const renderedEnd = cartesianToGeo(positions![1]);
    const startT = 120 / ensb!.lengthM;
    const endT = (ensb!.lengthM - 120) / ensb!.lengthM;
    const expectedStart = {
      lat: ensb!.start.lat + (ensb!.end!.lat - ensb!.start.lat) * startT,
      lon: ensb!.start.lon + (ensb!.end!.lon - ensb!.start.lon) * startT,
    };
    const expectedEnd = {
      lat: ensb!.start.lat + (ensb!.end!.lat - ensb!.start.lat) * endT,
      lon: ensb!.start.lon + (ensb!.end!.lon - ensb!.start.lon) * endT,
    };

    expect(distanceM(renderedStart, expectedStart)).toBeLessThan(1);
    expect(distanceM(renderedEnd, expectedEnd)).toBeLessThan(1);
  });

  it('removes only entities it created on unmount', () => {
    const { added, viewer, viewerRef } = createViewerRef();
    const { unmount } = render(<RunwayLayer viewerRef={viewerRef as never} />);

    unmount();

    expect(viewer.entities.remove).toHaveBeenCalledTimes(added.length);
    expect(viewer.entities.remove).toHaveBeenCalledWith(added[0]);
  });

  it('does not touch destroyed Cesium entity resources during cleanup', () => {
    const { viewer, viewerRef } = createViewerRef();
    const { unmount } = render(<RunwayLayer viewerRef={viewerRef as never} />);
    viewer.isDestroyed = () => true;
    viewer.entities.remove = vi.fn(() => {
      throw new Error('entities were destroyed');
    });

    expect(() => unmount()).not.toThrow();
  });

  it('orders KSEA 16L/C/R laterally from east/left to west/right when facing runway 16', () => {
    const runway16C = KSEA_RUNWAYS.find((runway) => runway.id === '16C');
    const runway16R = KSEA_RUNWAYS.find((runway) => runway.id === '16R');

    expect(runway16C).toBeTruthy();
    expect(runway16R).toBeTruthy();
    expect(KSEA_RUNWAY_16L.start.lon).toBeGreaterThan(runway16C?.start.lon ?? Number.POSITIVE_INFINITY);
    expect(runway16C?.start.lon).toBeGreaterThan(runway16R?.start.lon ?? Number.POSITIVE_INFINITY);
  });

  it('shares KSEA scenario spawn heading and start position with runway data', () => {
    expect(KSEA_RUNWAYS).toContain(KSEA_RUNWAY_16L);
    [KSEA_TUTORIAL_SCENARIO, KSEA_LIGHT_PATTERN_SCENARIO].forEach((scenario) => {
      expect(scenario.runway.airport).toBe(KSEA_RUNWAY_16L.airport);
      expect(scenario.runway.runway).toBe(KSEA_RUNWAY_16L.id);
      expect(scenario.runway.headingDeg).toBe(KSEA_RUNWAY_16L.headingDeg);
      expect(scenario.position.lat).toBeCloseTo(KSEA_RUNWAY_16L.start.lat, 6);
      expect(scenario.position.lon).toBeCloseTo(KSEA_RUNWAY_16L.start.lon, 6);
    });
  });
});
