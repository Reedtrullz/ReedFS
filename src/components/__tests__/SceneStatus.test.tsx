import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SceneStatusOverlay } from '../SceneStatus';
import type { CesiumSceneFailure } from '../../viewport/CesiumViewport';

const degradedPolicy = {
  mode: 'degraded' as const,
  terrain: 'ellipsoid' as const,
  osmBuildings: false,
  token: null,
  reason: 'missing token',
};

const ionPolicy = {
  mode: 'ion' as const,
  terrain: 'world' as const,
  osmBuildings: true,
  token: 'token',
  reason: null,
};

const buildingsFailure: CesiumSceneFailure = { stage: 'buildings', error: new Error('offline') };

describe('SceneStatusOverlay', () => {
  it('shows a degraded scenery message when Cesium Ion is unavailable', () => {
    render(<SceneStatusOverlay policy={degradedPolicy} />);
    expect(screen.getByText(/SCENERY DEGRADED/i)).toBeTruthy();
    expect(screen.getByText(/missing token/i)).toBeTruthy();
  });

  it('stays quiet when full Ion scenery is available without failures', () => {
    const { container } = render(<SceneStatusOverlay policy={ionPolicy} />);
    expect(container.textContent).toBe('');
  });

  it('shows a scenery error with a retry control when an Ion asset fails', () => {
    const onRetry = vi.fn();
    render(<SceneStatusOverlay policy={ionPolicy} failure={buildingsFailure} onRetry={onRetry} />);

    expect(screen.getByText('SCENERY ERROR')).toBeTruthy();
    expect(screen.getByText(/3D buildings could not be loaded./i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /RETRY SCENERY/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not show a retry control without an explicit onRetry handler', () => {
    render(<SceneStatusOverlay policy={ionPolicy} failure={buildingsFailure} />);
    expect(screen.getByText('SCENERY ERROR')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
