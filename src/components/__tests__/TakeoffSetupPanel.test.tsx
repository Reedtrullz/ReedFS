import { beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
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

    expect(screen.getByRole('region', { name: 'Takeoff setup' })).toHaveTextContent(/START ROLL preserves/i);
    expect(screen.queryByText(/resets the takeoff levers/i)).not.toBeInTheDocument();
    expect(screen.getByText('Flaps 5')).toBeTruthy();
    expect(screen.getByText('Trim 5.0')).toBeTruthy();
    expect(screen.getByText('Throttle 0%')).toBeTruthy();
    expect(screen.getByText('Gear UP')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Flaps Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trim Nose Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Throttle Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gear' }));

    const state = useSimStore.getState();
    expect(state.inputs.flapLever).toBe(10);
    expect(state.aircraft.config.stabilizerTrimUnits).toBeCloseTo(5.1, 5);
    expect(state.inputs.throttle1).toBeCloseTo(0.05, 5);
    expect(state.inputs.throttle2).toBeCloseTo(0.05, 5);
    expect(state.inputs.gearLever).toBe('DOWN');

    fireEvent.click(screen.getByRole('button', { name: 'Flaps Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trim Nose Down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Throttle Down' }));

    const recovered = useSimStore.getState();
    expect(recovered.inputs.flapLever).toBe(5);
    expect(recovered.aircraft.config.stabilizerTrimUnits).toBeCloseTo(5.0, 5);
    expect(recovered.inputs.throttle1).toBeCloseTo(0, 5);
    expect(recovered.inputs.throttle2).toBeCloseTo(0, 5);
  });

  it('exposes bidirectional and target takeoff setup controls', () => {
    render(<TakeoffSetupPanel />);
    expect(screen.getByRole('button', { name: /Flaps Previous/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Trim Nose Down/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Throttle Down/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Set takeoff config/i })).toBeVisible();
  });

  it('sets the active scenario takeoff configuration directly', () => {
    useSimStore.getState().setInput({ flapLever: 30, throttle1: 0.7, throttle2: 0.7 });
    useSimStore.getState().applyInputActions({ trimDelta: 1 }, 0);
    useSimStore.setState((state) => {
      const pilotInputs = { ...state.pilotInputs, gearLever: 'UP' as const };
      return { pilotInputs, effectiveControls: pilotInputs, inputs: pilotInputs };
    });

    render(<TakeoffSetupPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Set takeoff config/i }));

    const state = useSimStore.getState();
    expect(state.inputs.flapLever).toBe(ENVA_TUTORIAL_SCENARIO.flapSetting);
    expect(state.aircraft.config.stabilizerTrimUnits).toBe(ENVA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    expect(state.inputManager.stabilizerTrimUnits).toBe(ENVA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    expect(state.inputs.throttle1).toBe(0);
    expect(state.inputs.throttle2).toBe(0);
    expect(state.inputs.gearLever).toBe('DOWN');
  });

  it('shows the configured setup after starting the takeoff roll', () => {
    const store = useSimStore.getState();
    store.setInput({ flapLever: 10, throttle1: 0.35, throttle2: 0.35, gearLever: 'DOWN' });
    store.startTakeoffRoll();

    render(<TakeoffSetupPanel />);

    expect(screen.getByText('Flaps 10')).toBeTruthy();
    expect(screen.getByText('Trim 5.0')).toBeTruthy();
    expect(screen.getByText('Throttle 35%')).toBeTruthy();
    expect(screen.getByText('Gear DOWN')).toBeTruthy();
  });
});
