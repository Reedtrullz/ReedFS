import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneStatus } from '../SceneStatus';

describe('SceneStatus', () => {
  it('shows a degraded scenery message when Cesium Ion is unavailable', () => {
    render(<SceneStatus policy={{ mode: 'degraded', terrain: 'ellipsoid', osmBuildings: false, token: null, reason: 'missing token' }} />);
    expect(screen.getByText(/SCENERY DEGRADED/i)).toBeTruthy();
    expect(screen.getByText(/missing token/i)).toBeTruthy();
  });

  it('stays quiet when full Ion scenery is available', () => {
    const { container } = render(<SceneStatus policy={{ mode: 'ion', terrain: 'world', osmBuildings: true, token: 'token', reason: null }} />);
    expect(container.textContent).toBe('');
  });
});
