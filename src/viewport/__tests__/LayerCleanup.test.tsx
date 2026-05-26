import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { RefObject } from 'react';
import { ThreeLayer } from '../ThreeLayer';
import { AirportLayer } from '../AirportLayer';
import { ContrailLayer } from '../ContrailLayer';
import { CockpitLayer } from '../CockpitLayer';

const mockTtc = vi.hoisted(() => ({
  add: vi.fn(() => ({ children: [] })),
  remove: vi.fn(),
  update: vi.fn(),
  destroy: vi.fn(),
  threeSceneAdd: vi.fn(),
}));

vi.mock('three-to-cesium', () => ({
  default: vi.fn(() => ({
    add: mockTtc.add,
    remove: mockTtc.remove,
    update: mockTtc.update,
    destroy: mockTtc.destroy,
    threeScene: { add: mockTtc.threeSceneAdd },
  })),
}));

vi.mock('../AircraftModel', () => ({
  createBoeing737Model: vi.fn(() => ({
    clone: vi.fn(() => ({
      rotation: { set: vi.fn() },
      children: [],
    })),
  })),
}));

vi.mock('../CockpitModel', () => ({
  createCockpitModel: vi.fn(() => ({
    quaternion: { copy: vi.fn() },
    children: [],
  })),
}));

vi.mock('cesium', () => ({
  Cartesian3: { fromDegrees: vi.fn(() => ({ x: 0, y: 0, z: 0 })) },
  Transforms: { eastNorthUpToFixedFrame: vi.fn(() => ({})) },
  ParticleSystem: vi.fn(function ParticleSystem() {
    return { emissionRate: 0, modelMatrix: {} };
  }),
  CircleEmitter: vi.fn(function CircleEmitter() {}),
}));

vi.mock('three', () => ({
  AmbientLight: vi.fn(function AmbientLight() {
    return { intensity: 0, color: { set: vi.fn() } };
  }),
  DirectionalLight: vi.fn(function DirectionalLight() {
    return { intensity: 0, position: { set: vi.fn() } };
  }),
  PlaneGeometry: vi.fn(function PlaneGeometry() {}),
  MeshStandardMaterial: vi.fn(function MeshStandardMaterial() {}),
  Mesh: vi.fn(function Mesh() {
    return {
      rotation: { x: 0, z: 0, set: vi.fn() },
      children: [],
      scale: { y: 1 },
      name: '',
    };
  }),
  DoubleSide: 2,
}));

type TestViewer = {
  isDestroyed?: () => boolean;
  scene?: {
    postRender: {
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
    };
    preRender: {
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
    };
    primitives: {
      add: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };
};

function createViewerRef() {
  const viewer: TestViewer = {
    scene: {
      postRender: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      preRender: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      primitives: {
        add: vi.fn((primitive) => primitive),
        remove: vi.fn(),
      },
    },
  };
  return { viewer, viewerRef: { current: viewer } as RefObject<TestViewer> };
}

describe('viewport layer cleanup', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    mockTtc.add.mockClear();
    mockTtc.remove.mockClear();
    mockTtc.update.mockClear();
    mockTtc.destroy.mockClear();
    mockTtc.threeSceneAdd.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('CockpitLayer renders on postRender so CameraManager preRender updates the camera first', () => {
    const { viewer, viewerRef } = createViewerRef();

    render(<CockpitLayer viewerRef={viewerRef as never} />);

    expect(viewer.scene?.postRender.addEventListener).toHaveBeenCalledTimes(1);
    expect(viewer.scene?.preRender.addEventListener).not.toHaveBeenCalled();
  });

  it.each([
    ['ThreeLayer', ThreeLayer],
    ['AirportLayer', AirportLayer],
    ['ContrailLayer', ContrailLayer],
    ['CockpitLayer', CockpitLayer],
  ])('%s does not read viewer.scene during cleanup after Cesium has destroyed it', (_name, Layer) => {
    const { viewer, viewerRef } = createViewerRef();
    const { unmount } = render(<Layer viewerRef={viewerRef as never} />);

    viewer.scene = undefined;

    expect(() => unmount()).not.toThrow();
  });

  it.each([
    ['ThreeLayer', ThreeLayer],
    ['AirportLayer', AirportLayer],
    ['ContrailLayer', ContrailLayer],
    ['CockpitLayer', CockpitLayer],
  ])('%s does not touch destroyed Cesium scene resources during cleanup', (_name, Layer) => {
    const { viewer, viewerRef } = createViewerRef();
    const { unmount } = render(<Layer viewerRef={viewerRef as never} />);

    viewer.isDestroyed = () => true;
    if (viewer.scene) {
      viewer.scene.postRender.removeEventListener = vi.fn(() => {
        throw new Error('postRender was destroyed');
      });
      viewer.scene.primitives.remove = vi.fn(() => {
        throw new Error('primitives were destroyed');
      });
    }

    expect(() => unmount()).not.toThrow();
  });
});
