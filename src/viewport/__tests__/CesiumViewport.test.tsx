import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockViewerDestroy,
  mockViewerInstances,
  mockFromWorldTerrain,
  mockCreateOsmBuildingsAsync,
  mockOsmBuildings,
  mockRenderErrorListeners,
  mockClockTickListeners,
  mockPreRenderListeners,
} = vi.hoisted(() => ({
  mockViewerDestroy: vi.fn(),
  mockViewerInstances: [] as Array<{
    destroy: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;
    clock: { shouldAnimate: boolean; currentTime: { utcMs: number } };
    scene: {
      screenSpaceCameraController: { enableInputs: boolean };
      renderError: {
        addEventListener: ReturnType<typeof vi.fn>;
      };
      globe: { enableLighting: boolean; terrainExaggeration?: number; showWaterEffect?: boolean };
      skyAtmosphere: { show: boolean; brightnessShift: number };
      requestRenderMode?: boolean;
      maximumRenderTimeChange?: number;
      primitives: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
    };
  }>,
  mockFromWorldTerrain: vi.fn(() => ({ kind: 'world-terrain' })),
  mockCreateOsmBuildingsAsync: vi.fn(() => Promise.resolve({ kind: 'osm-buildings' })),
  mockOsmBuildings: { kind: 'osm-buildings' },
  mockRenderErrorListeners: [] as Array<() => void>,
  mockClockTickListeners: [] as Array<() => void>,
  mockPreRenderListeners: [] as Array<() => void>,
}));

vi.mock('cesium', () => ({
  JulianDate: { fromDate: vi.fn((date: Date, result: { utcMs: number }) => { result.utcMs = date.getTime(); return result; }) },
  Ion: { defaultAccessToken: '' },
  Viewer: vi.fn(function Viewer() {
    const color = (): { red: number; green: number; blue: number; alpha: number; clone: () => unknown } => ({ red: 0.2, green: 0.3, blue: 0.4, alpha: 1, clone: color });
    let destroyed = false;
    const viewer = {
      destroy: vi.fn(() => {
        destroyed = true;
        mockViewerDestroy();
      }),
      isDestroyed: vi.fn(() => destroyed),
      clock: { shouldAnimate: true, currentTime: { utcMs: 0 }, onTick: { addEventListener: vi.fn((listener: () => void) => {
        mockClockTickListeners.push(listener);
        return () => { const i = mockClockTickListeners.indexOf(listener); if (i >= 0) mockClockTickListeners.splice(i, 1); };
      }) } },
      imageryLayers: { length: 0, get: vi.fn() },
      scene: {
        screenSpaceCameraController: { enableInputs: true },
        globe: { enableLighting: false, baseColor: color() },
        skyAtmosphere: { show: false, brightnessShift: 0 },
        preRender: { addEventListener: vi.fn((listener: () => void) => { mockPreRenderListeners.push(listener); }),
          removeEventListener: vi.fn((listener: () => void) => { const i = mockPreRenderListeners.indexOf(listener); if (i >= 0) mockPreRenderListeners.splice(i, 1); }) },
        renderError: {
          addEventListener: vi.fn((listener: () => void) => {
            mockRenderErrorListeners.push(listener);
          }),
        },
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
import { useSimStore } from '../../store/simStore';
import { scenarioUtcMs } from '../../sim/scenarioClock';

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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('CesiumViewport scene policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    vi.stubEnv('VITE_RFS_VISUAL_TEST', undefined);
    mockViewerInstances.length = 0;
    mockRenderErrorListeners.length = 0;
    mockClockTickListeners.length = 0;
    mockPreRenderListeners.length = 0;
    mockCreateOsmBuildingsAsync.mockResolvedValue(mockOsmBuildings);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('pins Cesium to the committed paused UTC and removes its clock observer on unmount', () => {
    useSimStore.getState().setScenario('ksea-tutorial');
    const rendered = render(<CesiumViewport scenePolicy={degradedPolicy} />);
    const viewer = mockViewerInstances[0];
    expect(viewer.clock.shouldAnimate).toBe(false);
    expect(viewer.clock.currentTime.utcMs).toBe(scenarioUtcMs(useSimStore.getState().aircraft));
    act(() => { useSimStore.getState().setScenarioUtc('2026-09-24T02:04:00Z'); });
    act(() => { mockClockTickListeners.forEach((listener) => listener()); });
    expect(viewer.clock.currentTime.utcMs).toBe(Date.UTC(2026, 8, 24, 2, 4));
    act(() => { mockClockTickListeners.forEach((listener) => listener()); });
    expect(viewer.clock.currentTime.utcMs).toBe(Date.UTC(2026, 8, 24, 2, 4));
    rendered.unmount(); expect(mockClockTickListeners).toHaveLength(0);
  });

  it('dims the night sky from the same paused UTC instead of retaining a daylight atmosphere', () => {
    useSimStore.getState().setScenario('enva-tutorial');
    useSimStore.getState().setScenarioUtc('2026-09-24T02:04:00Z');
    const rendered = render(<CesiumViewport scenePolicy={degradedPolicy} />);
    const viewer = mockViewerInstances[0];
    Object.assign(viewer, { camera: { positionCartographic: { latitude: 63.45767 * Math.PI / 180, longitude: 10.88 * Math.PI / 180 } } });
    act(() => { mockPreRenderListeners.forEach((listener) => listener()); });
    expect(viewer.scene.skyAtmosphere.brightnessShift).toBeCloseTo(-0.78, 8);
    expect(viewer.scene.globe.enableLighting).toBe(false);
    act(() => { useSimStore.getState().setScenarioUtc('2026-09-24T12:00:00Z'); });
    act(() => { mockPreRenderListeners.forEach((listener) => listener()); });
    expect(viewer.scene.skyAtmosphere.brightnessShift).toBe(0);
    expect(viewer.scene.globe.enableLighting).toBe(true);
    rendered.unmount(); expect(mockPreRenderListeners).toHaveLength(0);
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

  it('reports an OSM buildings load failure instead of swallowing it', async () => {
    const onSceneFailure = vi.fn();
    mockCreateOsmBuildingsAsync.mockRejectedValueOnce(new Error('network unavailable'));

    render(<CesiumViewport scenePolicy={ionPolicy} onSceneFailure={onSceneFailure} />);
    await flushMicrotasks();

    expect(onSceneFailure).toHaveBeenCalledTimes(1);
    expect(onSceneFailure).toHaveBeenCalledWith({ stage: 'buildings', error: expect.any(Error) });
  });

  it('reports scene render errors through the failure callback', () => {
    const onSceneFailure = vi.fn();

    render(<CesiumViewport scenePolicy={ionPolicy} onSceneFailure={onSceneFailure} />);
    expect(mockRenderErrorListeners).toHaveLength(1);

    act(() => {
      mockRenderErrorListeners[0]();
    });

    expect(onSceneFailure).toHaveBeenCalledWith({ stage: 'imagery', error: undefined });
  });

  it('reports non-bubbling loss from Cesium and overlay canvases and permits restoration', () => {
    const onSceneFailure = vi.fn();
    const { getByTestId, unmount } = render(<CesiumViewport scenePolicy={degradedPolicy} onSceneFailure={onSceneFailure} />);
    const container = getByTestId('cesium-viewport');
    for (const surface of ['cesium', 'three', 'cockpit']) {
      const canvas = document.createElement('canvas'); canvas.dataset.rfsSurface = surface; container.append(canvas);
      const event = new Event('webglcontextlost', { cancelable: true, bubbles: false });
      act(() => { canvas.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(true);
      expect(onSceneFailure).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'context', surface }));
    }
    const retired = container.querySelector('canvas')!; unmount(); onSceneFailure.mockClear();
    retired.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    mockRenderErrorListeners[0]();
    expect(onSceneFailure).not.toHaveBeenCalled();
  });

  it('reports renderer initialization failure without unmounting the application', () => {
    const onSceneFailure = vi.fn(); const failure = new Error('WebGL unavailable');
    vi.mocked(Cesium.Viewer).mockImplementationOnce(function Viewer() { throw failure; });
    expect(() => render(<CesiumViewport scenePolicy={degradedPolicy} onSceneFailure={onSceneFailure} />)).not.toThrow();
    expect(onSceneFailure).toHaveBeenCalledWith({ stage: 'load', error: failure });
  });

  it('stops reporting failures after the viewer is disposed', async () => {
    const onSceneFailure = vi.fn();
    const deferred = createDeferred<{ kind: string }>();
    mockCreateOsmBuildingsAsync.mockReturnValueOnce(deferred.promise);

    const { unmount } = render(<CesiumViewport scenePolicy={ionPolicy} onSceneFailure={onSceneFailure} />);
    unmount();

    await act(async () => {
      deferred.reject(new Error('late failure'));
      await deferred.promise.catch(() => undefined);
    });

    expect(onSceneFailure).not.toHaveBeenCalled();
  });
});
