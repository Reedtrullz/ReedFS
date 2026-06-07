import type { AircraftState } from '../types';
import type { FlightPlan, FlightPlanWaypoint } from '@shared/types/fmc';

const EARTH_RADIUS_M = 6371000;
const M_PER_NM = 1852;
const DEFAULT_CAPTURE_RADIUS_M = 0.5 * M_PER_NM;
const DEFAULT_ROUTE_COMPATIBILITY_RADIUS_M = 50 * M_PER_NM;
const LEG_COMPLETE_RADIUS_M = 0.1 * M_PER_NM;
const STANDARD_LNAV_BANK_RAD = 25 * Math.PI / 180;
const MAX_TURN_ANTICIPATION_LEG_FRACTION = 0.5;
const GRAVITY_MPS2 = 9.80665;

export interface NavOutput {
  crossTrackError: number;
  alongTrackDist: number;
  desiredTrack: number; // radians true
  activeWaypointIndex: number;
  waypointReached: boolean;
}

export interface RouteStatusSnapshot {
  routeName: string;
  routeValid: boolean;
  lnavAvailable: boolean;
  lnavUnavailableReason: string | null;
  activeLegIndex: number | null;
  activeLegCount: number;
  fromWaypointIndex: number | null;
  toWaypointIndex: number | null;
  fromIdent: string | null;
  nextWaypointIdent: string | null;
  distanceToNextM: number | null;
  distanceToNextNm: number | null;
  desiredTrackRad: number | null;
  desiredTrackDegTrue: number | null;
  crossTrackErrorM: number | null;
  alongTrackM: number | null;
  legLengthM: number | null;
  nextDesiredTrackRad: number | null;
  nextDesiredTrackDegTrue: number | null;
  turnAngleRad: number | null;
  turnAnticipationDistanceM: number | null;
  turnAnticipationDistanceNm: number | null;
  etaMinutes: number | null;
  waypointReached: boolean;
  sequenced: boolean;
}

export interface RouteStatusOptions {
  captureRadiusM?: number;
  routeCompatibilityRadiusM?: number;
  /** @deprecated Use routeCompatibilityRadiusM. Kept for existing callers. */
  originCompatibilityRadiusM?: number;
  turnAnticipationEnabled?: boolean;
}

interface RouteLeg {
  legIndex: number;
  fromWaypointIndex: number | null;
  toWaypointIndex: number;
  fromIdent: string | null;
  toIdent: string;
  fromLat: number | null;
  fromLon: number | null;
  toLat: number;
  toLon: number;
}

interface RouteValidationResult {
  routeName: string;
  legs: RouteLeg[];
  unavailableReason: string | null;
}

type SequencingReason = 'capture' | 'passed' | 'turnAnticipation' | null;

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

function normalizeRad(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((rad % twoPi) + twoPi) % twoPi;
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function normalizeSignedRad(rad: number): number {
  let normalized = rad;
  while (normalized > Math.PI) normalized -= 2 * Math.PI;
  while (normalized < -Math.PI) normalized += 2 * Math.PI;
  return normalized;
}

function routeNameFor(flightPlan: FlightPlan | null | undefined): string {
  if (!flightPlan) return 'NO ROUTE';
  const origin = flightPlan.origin || flightPlan.waypoints[0]?.ident || '????';
  const destination = flightPlan.destination || flightPlan.waypoints.at(-1)?.ident || '????';
  return `${origin}→${destination}`;
}

function waypointCoordReason(waypoint: FlightPlanWaypoint, index: number): string | null {
  if (waypoint.discontinuity) return `route discontinuity at waypoint ${waypoint.ident || index}`;
  if (!isFiniteNumber(waypoint.lat) || !isFiniteNumber(waypoint.lon)) {
    return `missing coordinates for waypoint ${waypoint.ident || index}`;
  }
  return null;
}

function validateAndBuildLegs(flightPlan: FlightPlan | null | undefined): RouteValidationResult {
  const routeName = routeNameFor(flightPlan);
  if (!flightPlan) return { routeName, legs: [], unavailableReason: 'no flight plan loaded' };
  if (flightPlan.waypoints.length === 0) return { routeName, legs: [], unavailableReason: 'flight plan has no waypoints' };

  for (let index = 0; index < flightPlan.waypoints.length; index++) {
    const reason = waypointCoordReason(flightPlan.waypoints[index], index);
    if (reason) return { routeName, legs: [], unavailableReason: reason };
  }

  if (flightPlan.waypoints.length === 1) {
    const only = flightPlan.waypoints[0];
    return {
      routeName,
      legs: [{
        legIndex: 0,
        fromWaypointIndex: null,
        toWaypointIndex: 0,
        fromIdent: null,
        toIdent: only.ident,
        fromLat: null,
        fromLon: null,
        toLat: only.lat as number,
        toLon: only.lon as number,
      }],
      unavailableReason: null,
    };
  }

  const legs: RouteLeg[] = [];
  for (let waypointIndex = 1; waypointIndex < flightPlan.waypoints.length; waypointIndex++) {
    const from = flightPlan.waypoints[waypointIndex - 1];
    const to = flightPlan.waypoints[waypointIndex];
    legs.push({
      legIndex: legs.length,
      fromWaypointIndex: waypointIndex - 1,
      toWaypointIndex: waypointIndex,
      fromIdent: from.ident,
      toIdent: to.ident,
      fromLat: from.lat as number,
      fromLon: from.lon as number,
      toLat: to.lat as number,
      toLon: to.lon as number,
    });
  }

  return {
    routeName,
    legs,
    unavailableReason: legs.length > 0 ? null : 'flight plan has no usable legs',
  };
}

function distanceM(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const meanLat = toRad((fromLat + toLat) / 2);
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const x = dLon * Math.cos(meanLat);
  const y = dLat;
  return Math.hypot(x, y) * EARTH_RADIUS_M;
}

function bearingRad(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const meanLat = toRad((fromLat + toLat) / 2);
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  return normalizeRad(Math.atan2(dLon * Math.cos(meanLat), dLat));
}

function groundOrTasMps(state: AircraftState): number | null {
  const horizontal = Math.hypot(state.velocity.u, state.velocity.v);
  if (horizontal > 1) return horizontal;
  const total = Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w);
  return total > 1 ? total : null;
}

function computeTurnAnticipationDistanceM(speedMps: number | null, turnAngleRad: number | null): number | null {
  if (speedMps === null || turnAngleRad === null) return null;
  const angle = Math.abs(turnAngleRad);
  if (angle < 1 * Math.PI / 180) return 0;
  const turnRadiusM = speedMps ** 2 / (GRAVITY_MPS2 * Math.tan(STANDARD_LNAV_BANK_RAD));
  return turnRadiusM * Math.tan(angle / 2);
}

function positionRelativeToLegM(leg: RouteLeg, lat: number, lon: number): { alongTrackM: number; crossTrackM: number; legLengthM: number } | null {
  if (leg.fromLat === null || leg.fromLon === null) return null;
  const refLat = toRad((leg.fromLat + leg.toLat) / 2);
  const bx = toRad(leg.toLon - leg.fromLon) * Math.cos(refLat) * EARTH_RADIUS_M;
  const by = toRad(leg.toLat - leg.fromLat) * EARTH_RADIUS_M;
  const px = toRad(lon - leg.fromLon) * Math.cos(refLat) * EARTH_RADIUS_M;
  const py = toRad(lat - leg.fromLat) * EARTH_RADIUS_M;
  const legLengthM = Math.hypot(bx, by);
  if (legLengthM <= 0) return null;
  const alongTrackM = (px * bx + py * by) / legLengthM;
  const crossTrackM = (px * by - py * bx) / legLengthM;
  return { alongTrackM, crossTrackM, legLengthM };
}

function distanceToRouteLegM(leg: RouteLeg, lat: number, lon: number): number {
  if (leg.fromLat === null || leg.fromLon === null) {
    return distanceM(lat, lon, leg.toLat, leg.toLon);
  }

  const relative = positionRelativeToLegM(leg, lat, lon);
  if (relative && relative.alongTrackM >= 0 && relative.alongTrackM <= relative.legLengthM) {
    return Math.abs(relative.crossTrackM);
  }

  return Math.min(
    distanceM(lat, lon, leg.fromLat, leg.fromLon),
    distanceM(lat, lon, leg.toLat, leg.toLon),
  );
}

function nearestRouteDistanceM(legs: RouteLeg[], lat: number, lon: number): number {
  return legs.reduce(
    (nearest, leg) => Math.min(nearest, distanceToRouteLegM(leg, lat, lon)),
    Number.POSITIVE_INFINITY,
  );
}

function computeLegTurnAngleRad(leg: RouteLeg, nextLeg: RouteLeg | undefined): number | null {
  if (!nextLeg || leg.fromLat === null || leg.fromLon === null) return null;
  const desiredTrackRad = bearingRad(leg.fromLat, leg.fromLon, leg.toLat, leg.toLon);
  const nextDesiredTrackRad = bearingRad(
    nextLeg.fromLat ?? leg.toLat,
    nextLeg.fromLon ?? leg.toLon,
    nextLeg.toLat,
    nextLeg.toLon,
  );
  return normalizeSignedRad(nextDesiredTrackRad - desiredTrackRad);
}

function turnAnticipationLeadM(
  state: AircraftState,
  leg: RouteLeg,
  nextLeg: RouteLeg | undefined,
): number | null {
  const horizontalSpeedMps = Math.hypot(state.velocity.u, state.velocity.v);
  const rawLeadM = computeTurnAnticipationDistanceM(
    horizontalSpeedMps > 1 ? horizontalSpeedMps : null,
    computeLegTurnAngleRad(leg, nextLeg),
  );
  return rawLeadM !== null && Number.isFinite(rawLeadM) && rawLeadM > 0 ? rawLeadM : null;
}

function sequencingReasonForLeg(
  state: AircraftState,
  leg: RouteLeg,
  nextLeg: RouteLeg | undefined,
  captureRadiusM: number,
  turnAnticipationEnabled: boolean,
): SequencingReason {
  const distanceToWaypointM = distanceM(state.position.lat, state.position.lon, leg.toLat, leg.toLon);
  if (distanceToWaypointM <= captureRadiusM) return 'capture';

  const relative = positionRelativeToLegM(leg, state.position.lat, state.position.lon);
  if (!relative) return null;
  if (relative.alongTrackM >= relative.legLengthM) return 'passed';

  if (!turnAnticipationEnabled || !nextLeg) return null;
  if (relative.alongTrackM < 0 || relative.alongTrackM >= relative.legLengthM) return null;

  const rawLeadM = turnAnticipationLeadM(state, leg, nextLeg);
  if (rawLeadM === null) return null;

  const boundedLeadM = Math.min(rawLeadM, relative.legLengthM * MAX_TURN_ANTICIPATION_LEG_FRACTION);
  if (!Number.isFinite(boundedLeadM) || boundedLeadM <= captureRadiusM) return null;

  return distanceToWaypointM <= boundedLeadM ? 'turnAnticipation' : null;
}

export function createNoRouteStatus(
  flightPlan: FlightPlan | null = null,
  reason = 'no flight plan loaded',
): RouteStatusSnapshot {
  return {
    routeName: routeNameFor(flightPlan),
    routeValid: false,
    lnavAvailable: false,
    lnavUnavailableReason: reason,
    activeLegIndex: null,
    activeLegCount: 0,
    fromWaypointIndex: null,
    toWaypointIndex: null,
    fromIdent: null,
    nextWaypointIdent: null,
    distanceToNextM: null,
    distanceToNextNm: null,
    desiredTrackRad: null,
    desiredTrackDegTrue: null,
    crossTrackErrorM: null,
    alongTrackM: null,
    legLengthM: null,
    nextDesiredTrackRad: null,
    nextDesiredTrackDegTrue: null,
    turnAngleRad: null,
    turnAnticipationDistanceM: null,
    turnAnticipationDistanceNm: null,
    etaMinutes: null,
    waypointReached: false,
    sequenced: false,
  };
}

export function getInitialActiveLegIndex(flightPlan: FlightPlan | null): number | null {
  const route = validateAndBuildLegs(flightPlan);
  return route.unavailableReason || route.legs.length === 0 ? null : route.legs[0].legIndex;
}

export function computeRouteStatus(
  state: AircraftState,
  flightPlan: FlightPlan | null,
  activeLegIndex: number | null,
  options: RouteStatusOptions = {},
): RouteStatusSnapshot {
  const route = validateAndBuildLegs(flightPlan);
  if (route.unavailableReason) return createNoRouteStatus(flightPlan, route.unavailableReason);

  const legs = route.legs;
  const routeCompatibilityRadiusM = options.routeCompatibilityRadiusM
    ?? options.originCompatibilityRadiusM
    ?? DEFAULT_ROUTE_COMPATIBILITY_RADIUS_M;
  if (nearestRouteDistanceM(legs, state.position.lat, state.position.lon) > routeCompatibilityRadiusM) {
    return createNoRouteStatus(
      flightPlan,
      'route is not compatible with current aircraft position',
    );
  }

  const captureRadiusM = options.captureRadiusM ?? DEFAULT_CAPTURE_RADIUS_M;
  const turnAnticipationEnabled = options.turnAnticipationEnabled ?? true;
  let legIndex = Math.max(0, Math.min(activeLegIndex ?? 0, legs.length - 1));
  let sequenced = false;

  while (legIndex < legs.length - 1) {
    const reason = sequencingReasonForLeg(
      state,
      legs[legIndex],
      legs[legIndex + 1],
      captureRadiusM,
      turnAnticipationEnabled,
    );
    if (!reason) break;
    legIndex += 1;
    sequenced = true;
  }

  const leg = legs[legIndex];
  const distanceToNextM = distanceM(state.position.lat, state.position.lon, leg.toLat, leg.toLon);
  const distanceToNextNm = distanceToNextM / M_PER_NM;
  const trackFromLat = leg.fromLat ?? state.position.lat;
  const trackFromLon = leg.fromLon ?? state.position.lon;
  const desiredTrackRad = bearingRad(trackFromLat, trackFromLon, leg.toLat, leg.toLon);
  const desiredTrackDegTrue = normalizeDeg(desiredTrackRad * 180 / Math.PI);
  const relative = positionRelativeToLegM(leg, state.position.lat, state.position.lon);
  const speedMps = groundOrTasMps(state);
  const nextLeg = legs[legIndex + 1];
  const nextDesiredTrackRad = nextLeg ? bearingRad(
    nextLeg.fromLat ?? leg.toLat,
    nextLeg.fromLon ?? leg.toLon,
    nextLeg.toLat,
    nextLeg.toLon,
  ) : null;
  const nextDesiredTrackDegTrue = nextDesiredTrackRad === null ? null : normalizeDeg(nextDesiredTrackRad * 180 / Math.PI);
  const turnAngleRad = nextDesiredTrackRad === null ? null : normalizeSignedRad(nextDesiredTrackRad - desiredTrackRad);
  const turnAnticipationDistanceM = computeTurnAnticipationDistanceM(speedMps, turnAngleRad);
  const turnAnticipationDistanceNm = turnAnticipationDistanceM === null ? null : turnAnticipationDistanceM / M_PER_NM;

  return {
    routeName: route.routeName,
    routeValid: true,
    lnavAvailable: true,
    lnavUnavailableReason: null,
    activeLegIndex: leg.legIndex,
    activeLegCount: legs.length,
    fromWaypointIndex: leg.fromWaypointIndex,
    toWaypointIndex: leg.toWaypointIndex,
    fromIdent: leg.fromIdent,
    nextWaypointIdent: leg.toIdent,
    distanceToNextM,
    distanceToNextNm,
    desiredTrackRad,
    desiredTrackDegTrue,
    crossTrackErrorM: relative?.crossTrackM ?? null,
    alongTrackM: relative?.alongTrackM ?? null,
    legLengthM: relative?.legLengthM ?? null,
    nextDesiredTrackRad,
    nextDesiredTrackDegTrue,
    turnAngleRad,
    turnAnticipationDistanceM,
    turnAnticipationDistanceNm,
    etaMinutes: speedMps ? distanceToNextM / speedMps / 60 : null,
    waypointReached: distanceToNextM <= captureRadiusM,
    sequenced,
  };
}

export function computeLNAV(
  state: AircraftState,
  flightPlan: FlightPlan | null,
  activeWptIndex: number,
): NavOutput {
  const def: NavOutput = {
    crossTrackError: 0,
    alongTrackDist: 0,
    desiredTrack: state.attitude.psi,
    activeWaypointIndex: 0,
    waypointReached: false,
  };

  if (!flightPlan || flightPlan.waypoints.length === 0) return def;

  const wpts = flightPlan.waypoints.filter(w => !w.discontinuity);
  if (wpts.length === 0) return def;

  const idx = Math.min(activeWptIndex, wpts.length - 1);
  const wpt = wpts[idx];

  if (wpt.lat === undefined || wpt.lon === undefined) return def;

  const desiredTrack = bearingRad(state.position.lat, state.position.lon, wpt.lat, wpt.lon);
  const distM = distanceM(state.position.lat, state.position.lon, wpt.lat, wpt.lon);
  const waypointReached = distM < LEG_COMPLETE_RADIUS_M;

  return {
    crossTrackError: 0, // simplified — direct-to waypoint
    alongTrackDist: distM,
    desiredTrack,
    activeWaypointIndex: idx,
    waypointReached,
  };
}
