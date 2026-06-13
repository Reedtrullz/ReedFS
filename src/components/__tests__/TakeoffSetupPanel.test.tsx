import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TakeoffSetupPanel } from '../TakeoffSetupPanel';
import { useSimStore } from '../../store/simStore';
import { ENVA_TUTORIAL_SCENARIO } from '../../sim/scenarios';

describe('TakeoffSetupPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSimStore.getState().setScenario(ENVA_TUTORIAL_SCENARIO.id);
    useSimStore.getState().reset();
    useSimStore.setState((state) => {
      const pilotInputs = { ...state.pilotInputs, gearLever: 'UP' as const };
      return {
        pilotInputs,
        effectiveControls: pilotInputs,
        inputs: pilotInputs,
      };
    });
  });

  it('shows takeoff configuration values and dispatches existing input actions', () => {
    render(<TakeoffSetupPanel />);

    expect(screen.getByRole('region', { name: 'Takeoff setup' })).toBeTruthy();
    expect(screen.getByText('Flaps 5')).toBeTruthy();
    expect(screen.getByText('Trim 5.0')).toBeTruthy();
    expect(screen.getByText('Throttle 0%')).toBeTruthy();
    expect(screen.getByText('Gear UP')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Flaps Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trim Nose Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Throttle Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gear' }));

    const state = useSimStore.getState();
    expect(state.inputs.flapLever).toBe(10);
    expect(state.aircraft.config.stabilizerTrimUnits).toBeCloseTo(5.1, 5);
    expect(state.inputs.throttle1).toBeCloseTo(0.05, 5);
    expect(state.inputs.throttle2).toBeCloseTo(0.05, 5);
    expect(state.inputs.gearLever).toBe('DOWN');
  });
});
