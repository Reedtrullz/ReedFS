import { beforeEach, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ScenarioClockPanel } from '../ScenarioClockPanel';
import { useSimStore } from '../../store/simStore';
import { scenarioUtcMs } from '../../sim/scenarioClock';

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
