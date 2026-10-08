import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSimStore } from '../../store/simStore';

const probe = vi.hoisted(() => ({ view: { available: false, dismissed: false, busy: false, message: '' }, defer: vi.fn() }));
vi.mock('../../app/flightUpdates', () => ({ flightUpdates: { subscribe: () => () => {}, snapshot: () => probe.view },
  deferFlightUpdate: probe.defer, requestFlightUpdate: vi.fn(), showFlightUpdate: vi.fn() }));
import { FlightUpdateBanner } from '../FlightUpdateBanner';
afterEach(() => { cleanup(); probe.view = { available: false, dismissed: false, busy: false, message: '' }; vi.clearAllMocks(); });

it('surfaces a registration failure while preserving the flight and offering dismissal', () => {
  const before = useSimStore.getState(); probe.view = { ...probe.view, message: 'Offline/update registration unavailable.' };
  render(<FlightUpdateBanner />);
  expect(screen.getByRole('status', { name: 'App updates unavailable' })).toHaveTextContent('registration unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss update status' }));
  expect(probe.defer).toHaveBeenCalledTimes(1); expect(useSimStore.getState()).toBe(before);
});
it('keeps the ordinary app free of an update notice when no update or failure exists', () => {
  render(<FlightUpdateBanner />); expect(screen.queryByRole('status')).toBeNull();
});
