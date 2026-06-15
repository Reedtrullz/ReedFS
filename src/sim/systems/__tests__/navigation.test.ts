import { describe, it, expect } from 'vitest';
import {
  computeLNAV,
  computeRouteStatus,
  createNoRouteStatus,
  routeStatusToNavOutput,
  type RouteStatusSnapshot,
} from '../navigation';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { FlightPlan } from '@shared/types/fmc';
import { KPDX_RUNWAY_10R_APPROACH } from '../../../viewport/runwayData';

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

function routeStatusForNavOutput(overrides: Partial<RouteStatusSnapshot> = {}): RouteStatusSnapshot {
  return {
    ...createNoRouteStatus(),
    routeName: 'KSEA→KPDX',
    routeValid: true,
    lnavAvailable: true,
    lnavUnavailableReason: null,
    activeLegIndex: 0,
    activeLegCount: 1,
    fromWaypointIndex: 0,
    toWaypointIndex: 1,
    fromIdent: 'KSEA',
    nextWaypointIdent: 'OLM',
    distanceToNextM: 18_520,
    distanceToNextNm: 10,
    desiredTrackRad: Math.PI / 2,
    desiredTrackDegTrue: 90,
    crossTrackErrorM: 926,
    alongTrackM: 4_000,
    legLengthM: 18_520,
    waypointReached: false,
    sequenced: false,
    ...overrides,
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

describe('routeStatusToNavOutput', () => {
  it('returns null for null or undefined route status', () => {
    expect(routeStatusToNavOutput(null)).toBeNull();
    expect(routeStatusToNavOutput(undefined)).toBeNull();
  });

  it('converts an available route status into VNAV/LNAV NavOutput using remaining distance', () => {
    const nav = routeStatusToNavOutput(routeStatusForNavOutput());

    expect(nav).toEqual({
      crossTrackError: 926,
      alongTrackDist: 18_520,
      desiredTrack: Math.PI / 2,
      activeWaypointIndex: 1,
      waypointReached: false,
    });
  });

  it('can apply the LNAV intercept correction used by AP heading targets', () => {
    const nav = routeStatusToNavOutput(routeStatusForNavOutput(), { maxInterceptDeg: 25 });

    expect(nav).not.toBeNull();
    expect(nav!.desiredTrack * 180 / Math.PI).toBeCloseTo(77.5, 5);
  });

  it('returns null for unavailable or under-specified route status', () => {
    expect(routeStatusToNavOutput(createNoRouteStatus())).toBeNull();
    expect(routeStatusToNavOutput(routeStatusForNavOutput({ routeValid: false }))).toBeNull();
    expect(routeStatusToNavOutput(routeStatusForNavOutput({ desiredTrackRad: null }))).toBeNull();
    expect(routeStatusToNavOutput(routeStatusForNavOutput({ desiredTrackRad: Number.NaN }))).toBeNull();
    expect(routeStatusToNavOutput(routeStatusForNavOutput({ desiredTrackRad: Number.POSITIVE_INFINITY }))).toBeNull();
    expect(routeStatusToNavOutput(routeStatusForNavOutput({ toWaypointIndex: null, activeLegIndex: null }))).toBeNull();
    expect(routeStatusToNavOutput(routeStatusForNavOutput({ toWaypointIndex: Number.NaN, activeLegIndex: null }))).toBeNull();
    expect(routeStatusToNavOutput(routeStatusForNavOutput({ toWaypointIndex: Number.POSITIVE_INFINITY, activeLegIndex: Number.NaN }))).toBeNull();
  });

  it('falls back to finite distance fields without treating along-track progress as remaining distance', () => {
    expect(routeStatusToNavOutput(routeStatusForNavOutput({
      distanceToNextM: 12_000,
      alongTrackM: 4_000,
    }))?.alongTrackDist).toBe(12_000);

    expect(routeStatusToNavOutput(routeStatusForNavOutput({
      distanceToNextM: null,
      alongTrackM: 3_000,
    }))?.alongTrackDist).toBe(3_000);

    expect(routeStatusToNavOutput(routeStatusForNavOutput({
      distanceToNextM: Number.NaN,
      alongTrackM: 4_000,
    }))?.alongTrackDist).toBe(4_000);

    expect(routeStatusToNavOutput(routeStatusForNavOutput({
      distanceToNextM: Number.POSITIVE_INFINITY,
      alongTrackM: Number.NaN,
    }))?.alongTrackDist).toBe(0);
  });

  it('sanitizes non-finite optional nav output inputs for valid route statuses', () => {
    for (const crossTrackErrorM of [null, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const nav = routeStatusToNavOutput(routeStatusForNavOutput({ crossTrackErrorM }));
      expect(nav?.crossTrackError).toBe(0);
    }

    const nav = routeStatusToNavOutput(routeStatusForNavOutput({ desiredTrackRad: 5 * Math.PI }), {
      maxInterceptDeg: Number.POSITIVE_INFINITY,
    });
    const negativeInterceptNav = routeStatusToNavOutput(routeStatusForNavOutput(), { maxInterceptDeg: -25 });
    const hugeFiniteInterceptNav = routeStatusToNavOutput(routeStatusForNavOutput({ crossTrackErrorM: 0 }), {
      maxInterceptDeg: Number.MAX_VALUE,
    });

    expect(nav).not.toBeNull();
    expect(nav!.desiredTrack).toBeCloseTo(Math.PI, 5);
    expect(Number.isFinite(nav!.desiredTrack)).toBe(true);
    expect(negativeInterceptNav?.desiredTrack).toBe(Math.PI / 2);
    expect(hugeFiniteInterceptNav?.desiredTrack).toBe(Math.PI / 2);
    expect(Number.isFinite(hugeFiniteInterceptNav?.desiredTrack)).toBe(true);
  });
});

describe('computeRouteStatus', () => {
  it('marks the route complete when capturing the final waypoint on the final leg', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.1, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.2, -122.0);

    const status = computeRouteStatus(state, fp, 1, { captureRadiusM: 100 });

    expect(status.routeValid).toBe(true);
    expect(status.routeComplete).toBe(true);
    expect(status.approachHandoff).toBe('complete');
    expect(status.lnavAvailable).toBe(false);
    expect(status.lnavUnavailableReason).toMatch(/route complete/i);
    expect(status.activeLegIndex).toBe(1);
    expect(status.fromIdent).toBe('MID');
    expect(status.nextWaypointIdent).toBe('DEST');
    expect(status.waypointReached).toBe(true);
    expect(routeStatusToNavOutput(status)).toBeNull();
  });

  it('marks route complete at a runway threshold with a landing-aware threshold handoff', () => {
    const approach = KPDX_RUNWAY_10R_APPROACH;
    const fp = makePlan([
      { ident: 'BTG', lat: 45.75, lon: -122.59, discontinuity: false },
      {
        ident: approach.finalApproachFix.ident,
        lat: approach.finalApproachFix.point.lat,
        lon: approach.finalApproachFix.point.lon,
        discontinuity: false,
        legType: 'TF',
      },
      {
        ident: approach.threshold.ident,
        lat: approach.threshold.point.lat,
        lon: approach.threshold.point.lon,
        discontinuity: false,
        legType: 'RW',
      },
    ]);
    const state = makeState(approach.threshold.point.lat, approach.threshold.point.lon, 72);

    const status = computeRouteStatus(state, fp, 1, { captureRadiusM: 100 });

    expect(status.routeValid).toBe(true);
    expect(status.routeComplete).toBe(true);
    expect(status.lnavAvailable).toBe(false);
    expect(status.approachHandoff).toBe('threshold');
    expect(status.activeLegIndex).toBe(1);
    expect(status.fromIdent).toBe(approach.finalApproachFix.ident);
    expect(status.nextWaypointIdent).toBe(approach.threshold.ident);
    expect(status.waypointReached).toBe(true);
    expect(routeStatusToNavOutput(status)).toBeNull();
  });

  it('reports final approach handoff while tracking the FAF leg before route completion', () => {
    const approach = KPDX_RUNWAY_10R_APPROACH;
    const fp = makePlan([
      { ident: 'BTG', lat: 45.75, lon: -122.59, discontinuity: false },
      {
        ident: approach.finalApproachFix.ident,
        lat: approach.finalApproachFix.point.lat,
        lon: approach.finalApproachFix.point.lon,
        discontinuity: false,
        legType: 'TF',
      },
      {
        ident: approach.threshold.ident,
        lat: approach.threshold.point.lat,
        lon: approach.threshold.point.lon,
        discontinuity: false,
        legType: 'RW',
      },
    ]);
    const state = makeState(45.745, -122.60, 100);

    const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

    expect(status.routeComplete).toBe(false);
    expect(status.lnavAvailable).toBe(true);
    expect(status.approachHandoff).toBe('final');
    expect(status.nextWaypointIdent).toBe(approach.finalApproachFix.ident);
  });

  it('marks the route complete after passing the final waypoint outside capture radius', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.1, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.205, -122.0);

    const status = computeRouteStatus(state, fp, 1, { captureRadiusM: 100 });

    expect(status.routeComplete).toBe(true);
    expect(status.lnavAvailable).toBe(false);
    expect(status.lnavUnavailableReason).toMatch(/route complete/i);
    expect(status.waypointReached).toBe(false);
    expect(routeStatusToNavOutput(status)).toBeNull();
  });

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

  it('sequences to the next leg inside the bounded turn-anticipation gate before the waypoint', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ]);
    const state = makeState(47.185, -122.0, 128.6);

    const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

    expect(status.lnavAvailable).toBe(true);
    expect(status.sequenced).toBe(true);
    expect(status.activeLegIndex).toBe(1);
    expect(status.fromIdent).toBe('MID');
    expect(status.nextWaypointIdent).toBe('DEST');
    expect(status.desiredTrackDegTrue).toBeCloseTo(90, 0);
  });

  it('does not turn-anticipate with vertical-only velocity', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ]);
    const state = makeState(47.185, -122.0, 0);
    state.velocity.u = 0;
    state.velocity.v = 0;
    state.velocity.w = 128.6;

    const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

    expect(status.activeLegIndex).toBe(0);
    expect(status.sequenced).toBe(false);
    expect(status.nextWaypointIdent).toBe('MID');
  });

  it('does not turn-anticipate when the aircraft is outside the bounded lead gate', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ]);
    const state = makeState(47.14, -122.0, 128.6);

    const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

    expect(status.lnavAvailable).toBe(true);
    expect(status.sequenced).toBe(false);
    expect(status.activeLegIndex).toBe(0);
    expect(status.nextWaypointIdent).toBe('MID');
  });

  it('bounds turn anticipation so short legs do not sequence immediately after the from waypoint', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.01, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.01, lon: -121.99, discontinuity: false },
    ]);
    const state = makeState(47.004, -122.0, 128.6);

    const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 50 });

    expect(status.sequenced).toBe(false);
    expect(status.activeLegIndex).toBe(0);
    expect(status.nextWaypointIdent).toBe('MID');
  });

  it('does not turn-anticipate for straight-through route geometry', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.4, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.185, -122.0, 128.6);

    const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

    expect(status.sequenced).toBe(false);
    expect(status.activeLegIndex).toBe(0);
    expect(status.nextWaypointIdent).toBe('MID');
  });

  it('does not turn-anticipate without usable forward speed', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ]);
    const state = makeState(47.185, -122.0, 0);

    const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

    expect(status.sequenced).toBe(false);
    expect(status.activeLegIndex).toBe(0);
    expect(status.nextWaypointIdent).toBe('MID');
  });

  it('does not turn-anticipate when turn anticipation is disabled for deterministic diagnostics', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ]);
    const state = makeState(47.185, -122.0, 128.6);

    const status = computeRouteStatus(state, fp, 0, {
      captureRadiusM: 100,
      turnAnticipationEnabled: false,
    });

    expect(status.sequenced).toBe(false);
    expect(status.activeLegIndex).toBe(0);
    expect(status.nextWaypointIdent).toBe('MID');
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

  it('keeps LNAV available when the aircraft is near a downstream active route leg beyond the origin compatibility radius', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 48.0, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 48.2, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(48.1, -122.0, 100);

    const status = computeRouteStatus(state, fp, 1);

    expect(status.routeValid).toBe(true);
    expect(status.lnavAvailable).toBe(true);
    expect(status.lnavUnavailableReason).toBeNull();
    expect(status.activeLegIndex).toBe(1);
    expect(status.fromIdent).toBe('MID');
    expect(status.nextWaypointIdent).toBe('DEST');
  });

  it('marks LNAV unavailable when the aircraft is not near the loaded route', () => {
    const fp = makePlan([
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'KPDX', lat: 45.59, lon: -122.60, discontinuity: false },
    ]);
    const state = makeState(63.4583, 10.9101);

    const status = computeRouteStatus(state, fp, 0);

    expect(status.routeName).toBe('KSEA→KPDX');
    expect(status.routeValid).toBe(false);
    expect(status.lnavAvailable).toBe(false);
    expect(status.lnavUnavailableReason).toMatch(/route.*not compatible.*current aircraft position/i);
    expect(status.distanceToNextNm).toBeNull();
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

  it('allows LNAV on valid legs before the first route discontinuity', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.1, lon: -122.0, discontinuity: false },
      { ident: 'DISCO', discontinuity: true },
      { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.05, -122.0);

    const status = computeRouteStatus(state, fp, 0);

    expect(status.routeValid).toBe(true);
    expect(status.lnavAvailable).toBe(true);
    expect(status.lnavUnavailableReason).toBeNull();
    expect(status.activeLegIndex).toBe(0);
    expect(status.activeLegCount).toBe(1);
    expect(status.fromIdent).toBe('ORIG');
    expect(status.nextWaypointIdent).toBe('MID');
    expect(routeStatusToNavOutput(status)).not.toBeNull();
  });

  it('ignores missing coordinates beyond the first discontinuity while guiding the valid prefix', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.1, lon: -122.0, discontinuity: false },
      { ident: 'DISCO', discontinuity: true },
      { ident: 'BROKEN', discontinuity: false },
    ]);
    const state = makeState(47.05, -122.0);

    const status = computeRouteStatus(state, fp, 0);

    expect(status.routeValid).toBe(true);
    expect(status.lnavAvailable).toBe(true);
    expect(status.lnavUnavailableReason).toBeNull();
    expect(status.nextWaypointIdent).toBe('MID');
  });

  it('stops LNAV at the first discontinuity boundary instead of calling the route complete', () => {
    const fp = makePlan([
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.1, lon: -122.0, discontinuity: false },
      { ident: 'DISCO', discontinuity: true },
      { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
    ]);
    const state = makeState(47.1, -122.0);

    const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

    expect(status.routeValid).toBe(true);
    expect(status.routeComplete).toBe(false);
    expect(status.lnavAvailable).toBe(false);
    expect(status.lnavUnavailableReason).toMatch(/discontinuity.*DISCO/i);
    expect(status.activeLegIndex).toBe(0);
    expect(status.nextWaypointIdent).toBe('MID');
    expect(status.waypointReached).toBe(true);
    expect(routeStatusToNavOutput(status)).toBeNull();
  });
});
