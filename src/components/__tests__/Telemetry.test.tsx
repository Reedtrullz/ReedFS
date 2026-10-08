import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Telemetry } from '../Telemetry';
import { useSimStore } from '../../store/simStore';
import { selectPfdIas, selectPfdTakeoffCue, selectTelemetryViewModel } from '../../store/selectors';

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

  it('shows invalid IAS and suppresses speed-derived cues when the pitot domain is unsupported', () => {
    useSimStore.getState().startTakeoffRoll(); const s = useSimStore.getState();
    useSimStore.setState({ wind: null, aircraft: { ...s.aircraft, velocity: { u: 400, v: 0, w: 0 } } });
    render(<Telemetry />);
    expect(screen.getByText('INVALID', { exact: true })).toBeTruthy();
    expect(screen.queryByText(/TAKEOFF ROLL|ROTATE|POSITIVE RATE/)).toBeNull();
    expect(selectTelemetryViewModel(useSimStore.getState()).iasKt).toBeNull();
    expect(selectPfdTakeoffCue(useSimStore.getState())).toBeNull();
    expect(selectPfdIas(useSimStore.getState())).toBeNull();
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
