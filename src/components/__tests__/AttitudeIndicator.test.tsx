import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AttitudeIndicator } from '../AttitudeIndicator';
import { useSimStore } from '../../store/simStore';
import { eulerToQuat } from '../../sim/physics/quaternion';

function formatConsoleCalls(calls: unknown[][]) {
  return calls
    .map((args) => args.map((arg) => String(arg)).join(' '))
    .join('\n');
}

describe('AttitudeIndicator', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not return a freshly allocated Zustand selector snapshot on render', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<AttitudeIndicator />);

    expect(formatConsoleCalls(errorSpy.mock.calls as unknown[][])).not.toContain('getSnapshot should be cached');
  });

  it('keeps SVG horizon rectangle heights non-negative at high pitch attitudes', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.attitude.theta = 30 * Math.PI / 180;
    aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
    useSimStore.setState({ aircraft });

    const { container } = render(<AttitudeIndicator />);
    const rectHeights = Array.from(container.querySelectorAll('rect')).map((rect) => Number(rect.getAttribute('height')));

    expect(rectHeights.length).toBeGreaterThan(0);
    expect(rectHeights.every((height) => Number.isFinite(height) && height >= 0)).toBe(true);
  });
});
