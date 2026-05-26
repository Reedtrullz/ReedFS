import { cleanup, render } from '@testing-library/react';
import type { RefObject } from 'react';
import ThreeToCesium from 'three-to-cesium';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KSEA_TUTORIAL_SCENARIO, KSEA_LIGHT_PATTERN_SCENARIO } from '../../sim/scenarios';
import { RunwayLayer } from '../RunwayLayer';
import { KSEA_RUNWAY_16L, KSEA_RUNWAYS } from '../runwayData';

vi.mock('three-to-cesium', () => ({
  default: vi.fn(),
}));

type Entity = { id?: string; [key: string]: unknown };

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
