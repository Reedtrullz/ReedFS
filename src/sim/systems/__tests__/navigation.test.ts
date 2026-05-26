import { describe, it, expect } from 'vitest';
import { computeLNAV, computeRouteStatus } from '../navigation';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { FlightPlan } from '@shared/types/fmc';

function makeState(lat: number, lon: number, speedMps = 100) {
  const state = createInitialState(B737_800_SPEC);
  state.position.lat = lat;
  state.position.lon = lon;
  state.velocity.u = speedMps;
  state.velocity.v = 0;
  state.velocity.w = 0;
  return state;
}

function makePlan(waypoints: FlightPlan['waypoints']): FlightPlan {
  return {
    origin: waypoints[0]?.ident ?? 'ORIG',
    destination: waypoints.at(-1)?.ident ?? 'DEST',
    flightNumber: '123',
    route: waypoints.map((waypoint) => waypoint.ident).join(' '),
    waypoints,
  };
}

describe('computeLNAV', () => {
  it('returns default when no flight plan', () => {
    const s = createInitialState(B737_800_SPEC);
    const nav = computeLNAV(s, null, 0);
    expect(nav.waypointReached).toBe(false);
    expect(nav.alongTrackDist).toBe(0);
  });

  it('returns default when no waypoints', () => {
    const s = createInitialState(B737_800_SPEC);
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '123',
      route: '',
      waypoints: [],
    };
    const nav = computeLNAV(s, fp, 0);
    expect(nav.waypointReached).toBe(false);
    expect(nav.alongTrackDist).toBe(0);
  });

  it('returns default when all waypoints are discontinuities', () => {
    const s = createInitialState(B737_800_SPEC);
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '123',
      route: '',
      waypoints: [{ ident: 'DISC', discontinuity: true }],
    };
    const nav = computeLNAV(s, fp, 0);
    expect(nav.waypointReached).toBe(false);
    expect(nav.alongTrackDist).toBe(0);
  });

  it('returns default when waypoint has no lat/lon', () => {
    const s = createInitialState(B737_800_SPEC);
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '123',
      route: '',
      waypoints: [{ ident: 'NOLATLON', discontinuity: false }],
    };
    const nav = computeLNAV(s, fp, 0);
    expect(nav.waypointReached).toBe(false);
  });

  it('computes track to waypoint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31; // KSEA
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '123',
      route: '',
      waypoints: [{ ident: 'WPT1', lat: 47.5, lon: -122.31, discontinuity: false }],
    };
    const nav = computeLNAV(s, fp, 0);
    // Waypoint is north of KSEA, so desired track should be roughly north (0 rad)
    expect(nav.desiredTrack).toBeCloseTo(0, 0);
    expect(nav.alongTrackDist).toBeGreaterThan(0);
  });

  it('computes track to waypoint east', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.5;
    s.position.lon = -122.31;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: '',
      flightNumber: '',
      route: '',
      waypoints: [{ ident: 'WPT1', lat: 47.5, lon: -122.0, discontinuity: false }],
    };
    const nav = computeLNAV(s, fp, 0);
    // Waypoint is east, so desired track should be roughly pi/2 rad (90°)
    expect(nav.desiredTrack).toBeCloseTo(Math.PI / 2, 0);
    expect(nav.alongTrackDist).toBeGreaterThan(0);
  });

  it('detects waypoint reached', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.5;
    s.position.lon = -122.31;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: '',
      flightNumber: '',
      route: '',
      waypoints: [{ ident: 'WPT1', lat: 47.50001, lon: -122.31, discontinuity: false }],
    };
    const nav = computeLNAV(s, fp, 0);
    expect(nav.waypointReached).toBe(true);
  });

  it('clamps active waypoint index to valid range', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '123',
      route: '',
      waypoints: [
        { ident: 'WPT1', lat: 47.5, lon: -122.31, discontinuity: false },
        { ident: 'WPT2', lat: 47.6, lon: -122.31, discontinuity: false },
      ],
    };
    // activeWptIndex 5 is out of range, should clamp to last waypoint (index 1)
    const nav = computeLNAV(s, fp, 5);
    expect(nav.activeWaypointIndex).toBe(1);
  });
});

describe('computeRouteStatus', () => {
  it('sequences to the next leg inside the capture radius and preserves original waypoint indexes', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.1, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.1005, -122.0);

    const status = computeRouteStatus(state, fp, 0);

    expect(status.lnavAvailable).toBe(true);
    expect(status.activeLegIndex).toBe(1);
    expect(status.fromWaypointIndex).toBe(1);
    expect(status.toWaypointIndex).toBe(2);
    expect(status.fromIdent).toBe('MID');
    expect(status.nextWaypointIdent).toBe('DEST');
  });

  it('sequences after passing the to-waypoint using along-track geometry even outside capture radius', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.1, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.105, -122.0);

    const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 50 });

    expect(status.lnavAvailable).toBe(true);
    expect(status.activeLegIndex).toBe(1);
    expect(status.fromIdent).toBe('MID');
    expect(status.nextWaypointIdent).toBe('DEST');
  });

  it('reports distance, desired track, and ETA to the active next waypoint', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'NEXT', lat: 47.1, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.0, -122.0, 100);

    const status = computeRouteStatus(state, fp, 0);

    expect(status.routeValid).toBe(true);
    expect(status.lnavAvailable).toBe(true);
    expect(status.nextWaypointIdent).toBe('NEXT');
    expect(status.distanceToNextM).toBeGreaterThan(11000);
    expect(status.distanceToNextNm).toBeCloseTo((status.distanceToNextM ?? 0) / 1852, 5);
    expect(status.desiredTrackRad).toBeCloseTo(0, 1);
    expect(status.desiredTrackDegTrue).toBeCloseTo(0, 0);
    expect(status.etaMinutes).toBeCloseTo((status.distanceToNextM ?? 0) / 100 / 60, 2);
  });

  it('reports signed cross-track error for the active route leg', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'NEXT', lat: 47.2, lon: -122.0, discontinuity: false },
    ]);
    const rightOfCourse = makeState(47.05, -121.98, 100);
    const leftOfCourse = makeState(47.05, -122.02, 100);

    const rightStatus = computeRouteStatus(rightOfCourse, fp, 0);
    const leftStatus = computeRouteStatus(leftOfCourse, fp, 0);

    expect(rightStatus.crossTrackErrorM).toBeGreaterThan(1000);
    expect(leftStatus.crossTrackErrorM).toBeLessThan(-1000);
  });

  it('reports turn anticipation metrics for the next active leg transition', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ]);
    const state = makeState(47.1, -122.0, 128.6);

    const status = computeRouteStatus(state, fp, 0);

    expect(status.nextDesiredTrackRad).toBeCloseTo(Math.PI / 2, 1);
    expect(status.nextDesiredTrackDegTrue).toBeCloseTo(90, 0);
    expect(status.turnAngleRad).toBeCloseTo(Math.PI / 2, 1);
    expect(status.turnAnticipationDistanceM).toBeGreaterThan(1000);
    expect(status.turnAnticipationDistanceNm).toBeCloseTo((status.turnAnticipationDistanceM ?? 0) / 1852, 5);
  });

  it('reports no turn anticipation metrics on the final route leg', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ]);
    const state = makeState(47.2, -121.9, 128.6);

    const status = computeRouteStatus(state, fp, 1);

    expect(status.nextDesiredTrackRad).toBeNull();
    expect(status.turnAngleRad).toBeNull();
    expect(status.turnAnticipationDistanceM).toBeNull();
  });

  it('marks LNAV unavailable with a clear reason when a waypoint is missing coordinates', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'BROKEN', discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.0, -122.0);

    const status = computeRouteStatus(state, fp, 0);

    expect(status.routeValid).toBe(false);
    expect(status.lnavAvailable).toBe(false);
    expect(status.lnavUnavailableReason).toMatch(/missing coordinates.*BROKEN/i);
    expect(status.nextWaypointIdent).toBeNull();
  });

  it('does not skip discontinuities when building route legs', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'DISCO', discontinuity: true },
      { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.0, -122.0);

    const status = computeRouteStatus(state, fp, 0);

    expect(status.routeValid).toBe(false);
    expect(status.lnavAvailable).toBe(false);
    expect(status.lnavUnavailableReason).toMatch(/discontinuity.*DISCO/i);
    expect(status.nextWaypointIdent).toBeNull();
  });
});
