import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { RouteEditPanel } from '../RouteEditPanel';
import { useSimStore } from '../../store/simStore';
import {
  createRouteEditSession,
  createRouteSourceFromFlightPlan,
  directToWaypoint,
  type RouteEditSession,
} from '../../sim/fms/routeAdapter';
import type { FlightPlan } from '@shared/types/fmc';

const plan: FlightPlan = {
  origin: 'KSEA',
  destination: 'KPDX',
  flightNumber: 'RF001',
  route: 'OLM BTG',
  waypoints: [
    { ident: 'OLM', lat: 46.9844, lon: -122.8823, discontinuity: false },
    { ident: 'BTG', lat: 45.7456, lon: -122.1178, discontinuity: false },
  ],
};

function stagedSession(): RouteEditSession {
  const source = createRouteSourceFromFlightPlan(plan, { id: 'test', type: 'rfms', label: 'Test route' });
  return directToWaypoint(createRouteEditSession(source), 'BTG');
}

describe('RouteEditPanel', () => {
  beforeEach(() => {
    cleanup();
    useSimStore.setState({
      routeEditSession: null,
      routeEditMessage: null,
      flightPlan: null,
      activeLegIndex: null,
    });
  });

  it('shows the no-route state when no edit session exists', () => {
    render(<RouteEditPanel />);
    expect(screen.getByText('No route loaded')).toBeTruthy();
  });

  it('renders draft rows with pending operation count', () => {
    useSimStore.setState({ routeEditSession: stagedSession() });
    render(<RouteEditPanel />);
    expect(screen.getByText((_, element) => element?.textContent === '2 BTG')).toBeTruthy();
    expect(screen.getByText('Draft modifications pending EXEC')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Execute staged route edits' }).textContent).toBe('Exec (1)');
  });

  it('EXEC commits the draft through the store and clears the pending state', async () => {
    useSimStore.setState({ routeEditSession: stagedSession() });
    render(<RouteEditPanel />);

    await act(async () => {
      screen.getByRole('button', { name: 'Execute staged route edits' }).click();
    });

    const state = useSimStore.getState();
    expect(state.flightPlan?.route).toContain('DIRECT TO');
    expect(state.routeEditSession?.draft).toBeNull();
    expect(state.routeEditSession?.pendingOperations).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText('Draft modifications pending EXEC')).toBeNull());
  });
});
