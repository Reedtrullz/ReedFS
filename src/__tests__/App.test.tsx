import { describe, it, expect, vi } from 'vitest';

const mockFlyTo = vi.fn();
const mockDestroy = vi.fn();

vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  Viewer: class {
    destroy = mockDestroy;
    camera = { flyTo: mockFlyTo };
  },
  Cartesian3: { fromDegrees: vi.fn(() => ({ x: 0, y: 0, z: 0 })) },
  Math: { toRadians: (d: number) => (d * Math.PI) / 180 },
  Terrain: { fromWorldTerrain: vi.fn(() => ({})) },
}));

import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('App', () => {
  it('renders RFS label', () => {
    render(<App />);
    expect(screen.getByText('RFS — Phase 0')).toBeTruthy();
  });
});
