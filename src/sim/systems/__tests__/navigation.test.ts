import { describe, it, expect } from 'vitest';
import { computeLNAV } from '../navigation';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { FlightPlan } from '@shared/types/fmc';

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
