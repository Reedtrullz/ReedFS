import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '../simStore';
import { createRunwayToRunwayFlight } from '../../sim/flightPlanLoader';
import { SUPPORTED_RUNWAYS } from '../../viewport/runwayData';

function loadKseaRoute() {
  const flightPlan = createRunwayToRunwayFlight({
    originAirport: 'KSEA',
    originRunway: '16L',
    destinationAirport: 'KPDX',
    destinationRunway: '10R',
  });
  const ksea16l = SUPPORTED_RUNWAYS.find((runway) => runway.airport === 'KSEA' && runway.id === '16L');
  if (!ksea16l) throw new Error('KSEA 16L fixture missing');
  useSimStore.getState().setFlightPlanAtRunway(flightPlan, ksea16l);
  return flightPlan;
}

describe('simStore route edit bridge', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('has no edit session before a route is loaded', () => {
    expect(useSimStore.getState().routeEditSession).toBeNull();
    expect(useSimStore.getState().routeEditMessage).toBeNull();
  });

  it('initializes an edit session when a route loads and clears it on reset', () => {
    loadKseaRoute();
    const session = useSimStore.getState().routeEditSession;
    expect(session).not.toBeNull();
    expect(session?.draft).toBeNull();
    expect(session?.pendingOperations).toHaveLength(0);
    expect(session?.active.waypoints.length).toBeGreaterThan(0);

    useSimStore.getState().reset();
    expect(useSimStore.getState().routeEditSession).toBeNull();
  });

  it('stages DIRECT TO as a draft without touching the active plan or route status', () => {
    loadKseaRoute();
    const before = useSimStore.getState();
    const activeBefore = before.flightPlan;
    const statusBefore = before.routeStatus;

    useSimStore.getState().stageDirectTo('KSEAKPDX_ENR');

    const after = useSimStore.getState();
    expect(after.routeEditSession?.draft).not.toBeNull();
    expect(after.routeEditSession?.pendingOperations).toEqual([
      { type: 'DIRECT_TO', ident: 'KSEAKPDX_ENR', fromIndex: 0 },
    ]);
    expect(after.flightPlan).toBe(activeBefore);
    expect(after.routeStatus).toBe(statusBefore);
  });

  it('reports a visible error for an unknown DIRECT TO waypoint without staging anything', () => {
    loadKseaRoute();
    useSimStore.getState().stageDirectTo('NOPE');
    expect(useSimStore.getState().routeEditMessage).toContain('NOPE');
    expect(useSimStore.getState().routeEditSession?.draft).toBeNull();
  });

  it('EXEC commits the draft through setFlightPlan semantics and clears pending operations', () => {
    loadKseaRoute();
    const routeNameBefore = useSimStore.getState().routeStatus.routeName;
    expect(useSimStore.getState().routeStatus.lnavAvailable).toBe(true);

    useSimStore.getState().stageDirectTo('KSEAKPDX_ENR');
    useSimStore.getState().executeRouteEdit();

    const after = useSimStore.getState();
    expect(after.routeEditSession?.draft).toBeNull();
    expect(after.routeEditSession?.pendingOperations).toHaveLength(0);
    expect(after.flightPlan?.route).toContain('DIRECT TO');
    expect(after.routeStatus.routeValid).toBe(true);
    expect(after.routeStatus.lnavAvailable).toBe(true);
    expect(routeNameBefore).toBe('KSEA→KPDX');
  });

  it('staged discontinuity EXEC leaves LNAV unavailable with a discontinuity reason', () => {
    loadKseaRoute();
    useSimStore.getState().stageInsertDiscontinuity(0);
    useSimStore.getState().executeRouteEdit();

    const after = useSimStore.getState();
    expect(after.flightPlan?.waypoints.some((waypoint) => waypoint.discontinuity)).toBe(true);
    expect(after.routeStatus.lnavAvailable).toBe(false);
    expect(after.routeStatus.lnavUnavailableReason ?? '').toMatch(/discontinuity/i);
    expect(after.routeEditMessage).toBeNull();
  });

  it('undo removes the last staged operation and clears the draft when empty', () => {
    loadKseaRoute();
    useSimStore.getState().stageInsertDiscontinuity(0);
    useSimStore.getState().undoRouteEditOperation();
    const session = useSimStore.getState().routeEditSession;
    expect(session?.draft).toBeNull();
    expect(session?.pendingOperations).toHaveLength(0);
    expect(useSimStore.getState().routeEditMessage).toBeNull();
  });
});
