import type { FlightPlan, FlightPlanWaypoint } from '@shared/types/fmc';

export type RouteSourceType = 'canned' | 'manual' | 'rfms';

export interface RouteSource {
  id: string;
  type: RouteSourceType;
  label: string;
  flightPlan: FlightPlan;
  limitations: string[];
}

export type RouteDraftOperation =
  | { type: 'DIRECT_TO'; ident: string; fromIndex: number }
  | { type: 'INSERT_DISCONTINUITY'; afterIndex: number };

export interface RouteEditSession {
  source: RouteSource;
  active: FlightPlan;
  draft: FlightPlan | null;
  pendingOperations: RouteDraftOperation[];
}

function cloneFlightPlan(flightPlan: FlightPlan): FlightPlan {
  return structuredClone(flightPlan);
}

function cloneWaypoint(waypoint: FlightPlanWaypoint): FlightPlanWaypoint {
  return structuredClone(waypoint);
}

function routeString(waypoints: FlightPlanWaypoint[]): string {
  return waypoints.map((waypoint) => waypoint.ident).join(' ');
}

function discontinuityWaypoint(): FlightPlanWaypoint {
  return {
    ident: 'DISCONTINUITY',
    discontinuity: true,
    coordinateSource: 'UNRESOLVED',
    legType: 'DISCONTINUITY',
  };
}

function applyDirectTo(plan: FlightPlan, operation: Extract<RouteDraftOperation, { type: 'DIRECT_TO' }>): FlightPlan {
  const targetIndex = plan.waypoints.findIndex((waypoint) => waypoint.ident.toUpperCase() === operation.ident.toUpperCase());
  if (targetIndex < 0) {
    throw new Error(`Cannot DIRECT_TO unknown waypoint ${operation.ident}`);
  }
  const fromIndex = Math.max(0, Math.min(operation.fromIndex, plan.waypoints.length - 1));
  const fromWaypoint = cloneWaypoint(plan.waypoints[fromIndex]);
  const remaining = plan.waypoints.slice(targetIndex).map(cloneWaypoint);
  const waypoints = targetIndex === fromIndex ? remaining : [fromWaypoint, ...remaining];
  const first = waypoints[0]?.ident ?? plan.origin;
  const target = waypoints[targetIndex === fromIndex ? 0 : 1]?.ident ?? operation.ident.toUpperCase();
  const downstream = waypoints.slice(targetIndex === fromIndex ? 1 : 2).map((waypoint) => waypoint.ident);

  return {
    ...cloneFlightPlan(plan),
    route: [first, 'DIRECT TO', target, ...downstream].join(' '),
    waypoints,
  };
}

function applyInsertDiscontinuity(
  plan: FlightPlan,
  operation: Extract<RouteDraftOperation, { type: 'INSERT_DISCONTINUITY' }>,
): FlightPlan {
  const insertAfterIndex = Math.max(0, Math.min(operation.afterIndex, plan.waypoints.length - 1));
  const waypoints = plan.waypoints.map(cloneWaypoint);
  waypoints.splice(insertAfterIndex + 1, 0, discontinuityWaypoint());
  return {
    ...cloneFlightPlan(plan),
    waypoints,
    route: routeString(waypoints),
  };
}

function applyOperation(plan: FlightPlan, operation: RouteDraftOperation): FlightPlan {
  switch (operation.type) {
    case 'DIRECT_TO':
      return applyDirectTo(plan, operation);
    case 'INSERT_DISCONTINUITY':
      return applyInsertDiscontinuity(plan, operation);
  }
}

function replayOperations(active: FlightPlan, operations: RouteDraftOperation[]): FlightPlan | null {
  if (operations.length === 0) return null;
  return operations.reduce((plan, operation) => applyOperation(plan, operation), cloneFlightPlan(active));
}

function withOperations(session: RouteEditSession, operations: RouteDraftOperation[]): RouteEditSession {
  return {
    ...session,
    active: cloneFlightPlan(session.active),
    draft: replayOperations(session.active, operations),
    pendingOperations: operations,
  };
}

export function createRouteSourceFromFlightPlan(
  flightPlan: FlightPlan,
  options: { id: string; type: RouteSourceType; label: string; limitations?: string[] },
): RouteSource {
  return {
    ...options,
    limitations: options.limitations ?? [],
    flightPlan: cloneFlightPlan(flightPlan),
  };
}

export function createRouteEditSession(source: RouteSource): RouteEditSession {
  return {
    source: { ...source, flightPlan: cloneFlightPlan(source.flightPlan), limitations: [...source.limitations] },
    active: cloneFlightPlan(source.flightPlan),
    draft: null,
    pendingOperations: [],
  };
}

export function directToWaypoint(session: RouteEditSession, ident: string, fromIndex = 0): RouteEditSession {
  return withOperations(session, [...session.pendingOperations, { type: 'DIRECT_TO', ident: ident.toUpperCase(), fromIndex }]);
}

export function insertRouteDiscontinuity(session: RouteEditSession, afterIndex: number): RouteEditSession {
  return withOperations(session, [...session.pendingOperations, { type: 'INSERT_DISCONTINUITY', afterIndex }]);
}

export function undoRouteDraftOperation(session: RouteEditSession): RouteEditSession {
  return withOperations(session, session.pendingOperations.slice(0, -1));
}

export function executeRouteDraft(session: RouteEditSession): RouteEditSession {
  if (!session.draft) {
    return { ...session, active: cloneFlightPlan(session.active), pendingOperations: [] };
  }
  return {
    ...session,
    active: cloneFlightPlan(session.draft),
    draft: null,
    pendingOperations: [],
  };
}

export function draftOrActiveFlightPlan(session: RouteEditSession): FlightPlan {
  return cloneFlightPlan(session.draft ?? session.active);
}
