import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EngineStrip } from '../EngineStrip';
import { useSimStore } from '../../store/simStore';

describe('EngineStrip', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('labels actual engine/configuration state separately from commanded pilot controls', () => {
    useSimStore.setState((s) => ({
      aircraft: {
        ...s.aircraft,
        position: { ...s.aircraft.position, alt: s.aircraft.position.alt + 80 },
        velocity: { ...s.aircraft.velocity, w: -1.5 },
        ground: { ...s.aircraft.ground, weightOnWheels: false, contact: 'none', onRunway: false, aglFt: 80, normalForceN: 0 },
      },
    }));
    useSimStore.getState().setInput({ throttle1: 0.82, throttle2: 0.82, flapLever: 5, gearLever: 'UP' });
    useSimStore.setState((s) => ({
      aircraft: {
        ...s.aircraft,
        config: {
          ...s.aircraft.config,
          flapSetting: 1,
          gearDown: true,
        },
        engines: [
          { ...s.aircraft.engines[0], n1: 34.4 },
          { ...s.aircraft.engines[1], n1: 35.6 },
        ],
      },
    }));

    render(<EngineStrip />);

    expect(screen.getByText('N1 ACT L')).toBeTruthy();
    expect(screen.getByText('N1 ACT R')).toBeTruthy();
    expect(screen.getByText('THR CMD')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
    expect(screen.getByText('FLAPS ACT')).toBeTruthy();
    expect(screen.getByText('1°')).toBeTruthy();
    expect(screen.getByText('FLAPS CMD')).toBeTruthy();
    expect(screen.getByText('5°')).toBeTruthy();
    expect(screen.getByText('GEAR ACT')).toBeTruthy();
    expect(screen.getByText('DN')).toBeTruthy();
    expect(screen.getByText('GEAR CMD')).toBeTruthy();
    expect(screen.getByText('UP')).toBeTruthy();
  });

  it('shows gear transit instead of pretending partial gear is fully up or down', () => {
    useSimStore.setState((s) => ({
      aircraft: {
        ...s.aircraft,
        config: {
          ...s.aircraft.config,
          gearDown: false,
          gearPosition: 0.4,
        },
      },
      pilotInputs: { ...s.pilotInputs, gearLever: 'UP' },
      effectiveControls: { ...s.effectiveControls, gearLever: 'UP' },
      inputs: { ...s.inputs, gearLever: 'UP' },
    }));

    render(<EngineStrip />);

    expect(screen.getByText('GEAR ACT')).toBeTruthy();
    expect(screen.getByText('TRN 40%')).toBeTruthy();
    expect(screen.getByText('GEAR CMD')).toBeTruthy();
    expect(screen.getByText('UP')).toBeTruthy();
  });
});
