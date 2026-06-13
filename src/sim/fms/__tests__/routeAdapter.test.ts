import { describe, expect, it } from 'vitest';
import { createDirectFlight, createKseaKpdxFlight, createKseaKpdxRouteSource } from '../../flightPlanLoader';
import {
  createRouteEditSession,
  createRouteSourceFromFlightPlan,
  directToWaypoint,
  draftOrActiveFlightPlan,
  executeRouteDraft,
  insertRouteDiscontinuity,
  undoRouteDraftOperation,
} from '../routeAdapter';

const waypointIdents = (plan: { waypoints: Array<{ ident: string }> }): string[] => plan.waypoints.map((waypoint) => waypoint.ident);

describe('RFMS route adapter seam', () => {
  it('wraps the canned KSEA route as an adapter source without changing the shared FlightPlan shape', () => {
    const source = createKseaKpdxRouteSource();

    expect(source.id).toBe('canned:ksea-kpdx');
    expect(source.type).toBe('canned');
    expect(source.label).toMatch(/KSEA.*KPDX/);
    expect(source.flightPlan).toEqual(createKseaKpdxFlight());
    expect(source.limitations.join(' ')).toMatch(/RFMS shared/i);
  });

  it('stages DIRECT_TO edits until EXEC and supports undo before execution', () => {
    const source = createKseaKpdxRouteSource();
    const session = createRouteEditSession(source);

    const direct = directToWaypoint(session, 'BTG');

    expect(waypointIdents(direct.active)).toEqual(['KSEA', 'OLM', 'BTG', 'KPDX']);
    expect(direct.pendingOperations).toEqual([{ type: 'DIRECT_TO', ident: 'BTG', fromIndex: 0 }]);
    expect(direct.draft).not.toBeNull();
    expect(waypointIdents(direct.draft!)).toEqual(['KSEA', 'BTG', 'KPDX']);
    expect(draftOrActiveFlightPlan(direct).route).toBe('KSEA DIRECT TO BTG KPDX');

    const undone = undoRouteDraftOperation(direct);
    expect(undone.draft).toBeNull();
    expect(undone.pendingOperations).toEqual([]);
    expect(waypointIdents(undone.active)).toEqual(['KSEA', 'OLM', 'BTG', 'KPDX']);

    const executed = executeRouteDraft(direct);
    expect(executed.draft).toBeNull();
    expect(executed.pendingOperations).toEqual([]);
    expect(waypointIdents(executed.active)).toEqual(['KSEA', 'BTG', 'KPDX']);
    expect(executed.active.route).toBe('KSEA DIRECT TO BTG KPDX');
  });

  it('stages route discontinuities as explicit unresolved legs until EXEC', () => {
    const session = createRouteEditSession(createKseaKpdxRouteSource());

    const edited = insertRouteDiscontinuity(session, 1);

    expect(edited.active.waypoints.some((waypoint) => waypoint.discontinuity)).toBe(false);
    expect(edited.pendingOperations).toEqual([{ type: 'INSERT_DISCONTINUITY', afterIndex: 1 }]);
    expect(waypointIdents(edited.draft!)).toEqual(['KSEA', 'OLM', 'DISCONTINUITY', 'BTG', 'KPDX']);
    const discontinuity = edited.draft!.waypoints[2];
    expect(discontinuity.discontinuity).toBe(true);
    expect(discontinuity.coordinateSource).toBe('UNRESOLVED');
    expect(discontinuity.lat).toBeUndefined();
    expect(discontinuity.lon).toBeUndefined();

    const executed = executeRouteDraft(edited);
    expect(executed.active.waypoints[2]).toEqual(discontinuity);
    expect(executed.active.route).toBe('KSEA OLM DISCONTINUITY BTG KPDX');
  });

  it('wraps arbitrary FlightPlan sources so canned routes are not the whole FMS boundary', () => {
    const directFlight = createDirectFlight('ENVA', 'KPDX');
    const source = createRouteSourceFromFlightPlan(directFlight, {
      id: 'manual:enva-kpdx',
      type: 'manual',
      label: 'Manual ENVA-KPDX',
      limitations: ['manual route source seam'],
    });

    expect(source.flightPlan).toEqual(directFlight);
    expect(source.id).toBe('manual:enva-kpdx');
    expect(source.type).toBe('manual');
    expect(source.limitations).toContain('manual route source seam');
  });
});
