import { describe, it, expect, vi } from 'vitest';

const mockFlyTo = vi.fn();
const mockDestroy = vi.fn();
const mockPostRenderAdd = vi.fn();
const mockPostRenderRemove = vi.fn();

vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  Viewer: class {
    destroy = mockDestroy;
    camera = { flyTo: mockFlyTo };
    scene = {
      postRender: {
        addEventListener: mockPostRenderAdd,
        removeEventListener: mockPostRenderRemove,
      },
    };
  },
  Cartesian3: { fromDegrees: vi.fn(() => ({ x: 0, y: 0, z: 0 })) },
  Math: { toRadians: (d: number) => (d * Math.PI) / 180 },
  Terrain: { fromWorldTerrain: vi.fn(() => ({})) },
}));

vi.mock('three', () => ({
  BoxGeometry: vi.fn(function() {}),
  MeshStandardMaterial: vi.fn(function() {}),
  Mesh: vi.fn(function() {}),
  AmbientLight: vi.fn(function() {}),
  DirectionalLight: vi.fn(function() { this.position = { set: vi.fn() }; }),
}));

vi.mock('three-to-cesium', () => ({
  default: vi.fn(() => ({
    add: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    threeScene: { add: vi.fn() },
  })),
}));

import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('App', () => {
  it('renders RFS label', () => {
    render(<App />);
    expect(screen.getByText('RFS — Phase 0')).toBeTruthy();
  });
});
