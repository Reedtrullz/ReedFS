import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockViewerDestroy,
  mockViewerInstances,
  mockFromWorldTerrain,
  mockCreateOsmBuildingsAsync,
  mockOsmBuildings,
} = vi.hoisted(() => ({
  mockViewerDestroy: vi.fn(),
  mockViewerInstances: [] as Array<{
    destroy: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;
    scene: {
      screenSpaceCameraController: { enableInputs: boolean };
      globe: { enableLighting: boolean; terrainExaggeration?: number; showWaterEffect?: boolean };
      skyAtmosphere: { show: boolean };
      requestRenderMode?: boolean;
      maximumRenderTimeChange?: number;
      primitives: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
    };
  }>,
  mockFromWorldTerrain: vi.fn(() => ({ kind: 'world-terrain' })),
  mockCreateOsmBuildingsAsync: vi.fn(() => Promise.resolve({ kind: 'osm-buildings' })),
  mockOsmBuildings: { kind: 'osm-buildings' },
}));

vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  Viewer: vi.fn(function Viewer() {
    let destroyed = false;
    const viewer = {
      destroy: vi.fn(() => {
        destroyed = true;
        mockViewerDestroy();
      }),
      isDestroyed: vi.fn(() => destroyed),
      scene: {
        screenSpaceCameraController: { enableInputs: true },
        globe: { enableLighting: false },
        skyAtmosphere: { show: false },
        primitives: { add: vi.fn((primitive: unknown) => primitive), remove: vi.fn() },
      },
    };
    mockViewerInstances.push(viewer);
    return viewer;
  }),
  Terrain: { fromWorldTerrain: mockFromWorldTerrain },
  createOsmBuildingsAsync: mockCreateOsmBuildingsAsync,
}));

import { act, cleanup, render } from '@testing-library/react';
import * as Cesium from 'cesium';
import type { CesiumScenePolicy } from '../../config/cesium';
import { CesiumViewport } from '../CesiumViewport';

const degradedPolicy: CesiumScenePolicy = {
  mode: 'degraded',
  terrain: 'ellipsoid',
  osmBuildings: false,
  token: null,
  reason: 'missing token',
};

const ionPolicy: CesiumScenePolicy = {
  mode: 'ion',
  terrain: 'world',
  osmBuildings: true,
  token: 'token',
  reason: null,
};

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('CesiumViewport scene policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    vi.stubEnv('VITE_RFS_VISUAL_TEST', undefined);
    mockViewerInstances.length = 0;
    mockCreateOsmBuildingsAsync.mockResolvedValue(mockOsmBuildings);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('disables Cesium default Ion imagery and avoids Ion-only assets when scene policy is degraded', () => {
    render(<CesiumViewport scenePolicy={degradedPolicy} />);

    expect(Cesium.Viewer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ baseLayer: false }),
    );
    expect(Cesium.Terrain.fromWorldTerrain).not.toHaveBeenCalled();
    expect(Cesium.createOsmBuildingsAsync).not.toHaveBeenCalled();
  });

  it('defaults to degraded policy without an env token and disables Cesium default Ion imagery', () => {
    render(<CesiumViewport />);

    expect(Cesium.Viewer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ baseLayer: false }),
    );
    expect(Cesium.Terrain.fromWorldTerrain).not.toHaveBeenCalled();
    expect(Cesium.createOsmBuildingsAsync).not.toHaveBeenCalled();
  });

  it('enables scene decorations outside visual test mode', () => {
    render(<CesiumViewport scenePolicy={degradedPolicy} />);

    const { globe, skyAtmosphere } = mockViewerInstances[0].scene;
    expect(globe.terrainExaggeration).toBe(1);
    expect(globe.enableLighting).toBe(true);
    expect(globe.showWaterEffect).toBe(true);
    expect(skyAtmosphere.show).toBe(true);
  });

  it('disables nondeterministic scene decorations in visual test mode', () => {
    vi.stubEnv('VITE_RFS_VISUAL_TEST', '1');

    render(<CesiumViewport scenePolicy={degradedPolicy} />);

    const { globe, skyAtmosphere } = mockViewerInstances[0].scene;
    expect(globe.terrainExaggeration).toBe(1);
    expect(globe.enableLighting).toBe(false);
    expect(globe.showWaterEffect).toBe(false);
    expect(skyAtmosphere.show).toBe(false);
  });

  it('marks the viewport ready for visual tests only after deterministic render settings are applied', () => {
    const onReady = vi.fn();
    vi.stubEnv('VITE_RFS_VISUAL_TEST', '1');

    render(<CesiumViewport scenePolicy={degradedPolicy} onReady={onReady} />);

    const viewer = mockViewerInstances[0];
    expect(viewer.scene.requestRenderMode).toBe(true);
    expect(viewer.scene.maximumRenderTimeChange).toBe(0);
    expect(onReady).toHaveBeenCalledWith(viewer);
  });

  it('adds OSM buildings to the same Ion viewer exactly once after async resolution', async () => {
    render(<CesiumViewport scenePolicy={ionPolicy} />);
    await flushMicrotasks();

    expect(Cesium.Terrain.fromWorldTerrain).toHaveBeenCalledTimes(1);
    expect(Cesium.createOsmBuildingsAsync).toHaveBeenCalledTimes(1);
    expect(mockViewerInstances).toHaveLength(1);
    expect(mockViewerInstances[0].scene.primitives.add).toHaveBeenCalledTimes(1);
    expect(mockViewerInstances[0].scene.primitives.add).toHaveBeenCalledWith(mockOsmBuildings);
  });

  it('does not add stale OSM buildings after Ion viewer cleanup and degraded remount', async () => {
    const deferred = createDeferred<typeof mockOsmBuildings>();
    mockCreateOsmBuildingsAsync.mockReturnValueOnce(deferred.promise);

    const { rerender } = render(<CesiumViewport scenePolicy={ionPolicy} />);
    expect(mockViewerInstances).toHaveLength(1);
    const ionViewer = mockViewerInstances[0];

    rerender(<CesiumViewport scenePolicy={degradedPolicy} />);
    expect(mockViewerInstances).toHaveLength(2);
    const degradedViewer = mockViewerInstances[1];

    deferred.resolve(mockOsmBuildings);
    await flushMicrotasks();

    expect(ionViewer.scene.primitives.add).not.toHaveBeenCalled();
    expect(degradedViewer.scene.primitives.add).not.toHaveBeenCalled();
  });
});
