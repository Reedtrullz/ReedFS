import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EngineStrip } from '../EngineStrip';
import { useSimStore } from '../../store/simStore';

describe('EngineStrip', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('labels actual engine/configuration state separately from commanded pilot controls', () => {
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
});
