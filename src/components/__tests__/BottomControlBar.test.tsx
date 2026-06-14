import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import appSource from '../../App.tsx?raw';
import rfsShellSource from '../../app/RfsShell.tsx?raw';
import { BottomControlBar, type BottomControlBarProps } from '../BottomControlBar';

function defaultProps(overrides: Partial<BottomControlBarProps> = {}): BottomControlBarProps {
  return {
    status: 'stopped',
    camMode: 'chase',
    overlayMode: 'flight',
    audioEnabled: false,
    audioStatus: 'off',
    routeLoadMessage: null,
    onStartRoll: vi.fn(),
    onAbortTakeoff: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onReset: vi.fn(),
    onNextCameraMode: vi.fn(),
    onNextOverlayMode: vi.fn(),
    onToggleAudio: vi.fn(),
    onLoadPlan: vi.fn(),
    ...overrides,
  };
}

describe('BottomControlBar', () => {
  it('keeps bottom simulator controls out of App.tsx while RfsShell delegates to BottomControlBar', () => {
    expect(appSource).toMatch(/<RfsShell\b/);
    expect(appSource).not.toMatch(/START ROLL|LOAD PLAN|AUDIO: OFF|Route load result/);
    expect(rfsShellSource).toMatch(/<BottomControlBar\b/);
  });

  it('renders stopped controls and dispatches all button callbacks', () => {
    const props = defaultProps();
    render(<BottomControlBar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'START ROLL' }));
    fireEvent.click(screen.getByRole('button', { name: 'RESET' }));
    fireEvent.click(screen.getByRole('button', { name: 'CAM: CHASE' }));
    fireEvent.click(screen.getByRole('button', { name: 'OVL: FLIGHT' }));
    fireEvent.click(screen.getByRole('button', { name: 'AUDIO: OFF' }));
    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));

    expect(props.onStartRoll).toHaveBeenCalledTimes(1);
    expect(props.onReset).toHaveBeenCalledTimes(1);
    expect(props.onNextCameraMode).toHaveBeenCalledTimes(1);
    expect(props.onNextOverlayMode).toHaveBeenCalledTimes(1);
    expect(props.onToggleAudio).toHaveBeenCalledTimes(1);
    expect(props.onLoadPlan).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'OVL: FLIGHT' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'AUDIO: OFF' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows resume while paused and abort/pause while running', () => {
    const paused = defaultProps({ status: 'paused' });
    const { rerender } = render(<BottomControlBar {...paused} />);

    fireEvent.click(screen.getByRole('button', { name: 'RESUME' }));
    expect(paused.onResume).toHaveBeenCalledTimes(1);

    const running = defaultProps({ status: 'running', routeLoadMessage: 'KSEA→KPDX route loaded.' });
    rerender(<BottomControlBar {...running} />);

    expect(screen.queryByRole('button', { name: 'START ROLL' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ABORT' }));
    fireEvent.click(screen.getByRole('button', { name: 'PAUSE' }));
    expect(running.onAbortTakeoff).toHaveBeenCalledTimes(1);
    expect(running.onPause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: 'Route load result' }).textContent).toBe('KSEA→KPDX route loaded.');
  });
});
