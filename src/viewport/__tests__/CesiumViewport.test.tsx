import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockViewerDestroy, mockViewerIsDestroyed, mockPrimitiveAdd, mockFromWorldTerrain, mockCreateOsmBuildingsAsync } = vi.hoisted(() => ({
  mockViewerDestroy: vi.fn(),
  mockViewerIsDestroyed: vi.fn(() => false),
  mockPrimitiveAdd: vi.fn((primitive: unknown) => primitive),
  mockFromWorldTerrain: vi.fn(() => ({ kind: 'world-terrain' })),
  mockCreateOsmBuildingsAsync: vi.fn(() => Promise.resolve({ kind: 'osm-buildings' })),
}));

vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  Viewer: vi.fn(function Viewer() {
    return {
      destroy: mockViewerDestroy,
      isDestroyed: mockViewerIsDestroyed,
      scene: {
        screenSpaceCameraController: { enableInputs: true },
        globe: { enableLighting: false },
        skyAtmosphere: { show: false },
        primitives: { add: mockPrimitiveAdd, remove: vi.fn() },
      },
    };
  }),
  Terrain: { fromWorldTerrain: mockFromWorldTerrain },
  createOsmBuildingsAsync: mockCreateOsmBuildingsAsync,
}));

import { cleanup, render } from '@testing-library/react';
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

describe('CesiumViewport scene policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not create Ion-only terrain or OSM buildings when scene policy is degraded', () => {
    render(<CesiumViewport scenePolicy={degradedPolicy} />);

    expect(Cesium.Terrain.fromWorldTerrain).not.toHaveBeenCalled();
    expect(Cesium.createOsmBuildingsAsync).not.toHaveBeenCalled();
  });

  it('creates Cesium World Terrain and OSM buildings when scene policy allows Ion assets', () => {
    render(<CesiumViewport scenePolicy={ionPolicy} />);

    expect(Cesium.Terrain.fromWorldTerrain).toHaveBeenCalledTimes(1);
    expect(Cesium.createOsmBuildingsAsync).toHaveBeenCalledTimes(1);
  });
});
