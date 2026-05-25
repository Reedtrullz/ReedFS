import { beforeEach, describe, it, expect } from 'vitest';
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
