import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Telemetry } from '../Telemetry';
import { useSimStore } from '../../store/simStore';

describe('Telemetry', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('renders ALT, TAS, HDG labels', () => {
    render(<Telemetry />);
    expect(screen.getByText(/ALT:/)).toBeTruthy();
    expect(screen.getByText(/TAS:/)).toBeTruthy();
    expect(screen.getByText(/HDG:/)).toBeTruthy();
  });

  it('renders takeoff cue during takeoff phase', () => {
    useSimStore.getState().reset();
    useSimStore.getState().startTakeoffRoll();

    render(<Telemetry />);

    expect(screen.getByText(/TAKEOFF ROLL|ROTATE|POSITIVE RATE/)).toBeTruthy();
  });
});

it('shows target separately from measured achieved rate after dropped time', () => {
  useSimStore.getState().reset(); useSimStore.getState().start();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
  try {
    useSimStore.getState().tick(1000);
    clock.mockReturnValue(2000);
    useSimStore.getState().tick(2000);
    render(<Telemetry />);
    expect(screen.getByText(/ACHIEVED 0.27x/)).toBeTruthy();
    expect(screen.getByText(/RATE 1x/)).toBeTruthy();
  } finally { clock.mockRestore(); }
});
