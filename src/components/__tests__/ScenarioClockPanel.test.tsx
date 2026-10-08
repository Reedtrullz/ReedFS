import { beforeEach, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ScenarioClockPanel } from '../ScenarioClockPanel';
import { useSimStore } from '../../store/simStore';
import { scenarioUtcMs, utcHours } from '../../sim/scenarioClock';

beforeEach(() => useSimStore.getState().setScenario('ksea-tutorial'));

it('applies the browser-normalized minute input as UTC and disables editing while running', () => {
  render(<ScenarioClockPanel />);
  fireEvent.click(screen.getByText('Date and time (UTC)'));
  const field = screen.getByLabelText('UTC date and time');
  fireEvent.change(field, { target: { value: '2026-12-31T23:59' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply UTC date/time' }));
  expect(scenarioUtcMs(useSimStore.getState().aircraft)).toBe(Date.UTC(2026, 11, 31, 23, 59));
  expect(screen.getByLabelText('Scenario UTC')).toHaveTextContent('2026-12-31T23:59:00Z');
  expect(screen.getByLabelText('Scenario UTC').tagName).toBe('TIME');
  act(() => useSimStore.getState().start());
  expect(field).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Apply UTC date/time' })).toBeDisabled();
});

it('displays the selected second after a progressed-time edit with sub-millisecond cancellation', () => {
  const state = useSimStore.getState();
  const simTime = 1_000_000_000_033.3334;
  useSimStore.setState({ aircraft: { ...state.aircraft, simTime, timeOfDay: utcHours(state.aircraft.utcEpochMs + simTime) } });
  render(<ScenarioClockPanel />);
  fireEvent.click(screen.getByText('Date and time (UTC)'));
  fireEvent.change(screen.getByLabelText('UTC date and time'), { target: { value: '1950-01-01T00:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply UTC date/time' }));
  expect(Math.abs(scenarioUtcMs(useSimStore.getState().aircraft) - Date.UTC(1950, 0, 1))).toBeLessThan(0.001);
  expect(screen.getByLabelText('Scenario UTC')).toHaveTextContent('1950-01-01T00:00:00Z');
});
