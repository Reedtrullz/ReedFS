import { describe, it, expect } from 'vitest';
import { computeVNAV } from '../vnav';
import { createInitialState, B737_800_SPEC } from '../../types';
import { createKseaKpdxFlight } from '../../flightPlanLoader';
import type { FlightPlan } from '@shared/types/fmc';

const navOut = {
  crossTrackError: 0,
  alongTrackDist: 18520,
  desiredTrack: 0,
  activeWaypointIndex: 0,
  waypointReached: false,
};
const M_PER_NM = 1852;
const DESCENT_PATH_FT_PER_NM = 318;

function routeWithFutureDescentConstraint(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'TST214',
    route: 'KSEA OLM BTG KPDX',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false },
      { ident: 'BTG', lat: 45.75, lon: -122.59, discontinuity: false, altitudeConstraint: { type: 'AT_OR_BELOW', altitude: 12000 }, speedConstraint: { type: 'AT_OR_BELOW', speed: 280 } },
      { ident: 'KPDX', lat: 45.59, lon: -122.6, discontinuity: false },
    ],
  };
}

describe('computeVNAV', () => {
  it('reports VNAV unavailable with a clear reason when no constraint exists', () => {
    const s = createInitialState(B737_800_SPEC);
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '',
      route: 'KSEA KPDX',
      waypoints: [{ ident: 'KPDX', lat: 45.59, lon: -122.6, discontinuity: false }],
    };

    const v = computeVNAV(s, fp, navOut);

    expect(v.available).toBe(false);
    expect(v.unavailableReason).toMatch(/constraint/i);
    expect(v.altitudeConstraint).toBe(false);
    expect(v.speedConstraint).toBe(false);
    expect(v.targetVs).toBe(0);
  });

  it('computes an AT altitude constraint target and clamps VS to a credible limit', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 5000;
    s.velocity.u = 128.6; // 250 kt
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '',
      route: 'KSEA WPT1',
      waypoints: [{
        ident: 'WPT1',
        lat: 47.5,
        lon: -122.31,
        discontinuity: false,
        altitudeConstraint: { type: 'AT', altitude: 15000 },
      }],
    };
    const shortLeg = { ...navOut, alongTrackDist: 1852 }; // 1 NM: raw climb demand is unrealistic.

    const v = computeVNAV(s, fp, shortLeg);

    expect(v.available).toBe(true);
    expect(v.unavailableReason).toBeNull();
    expect(v.altitudeConstraint).toBe(true);
    expect(v.targetAlt).toBe(15000);
    expect(v.targetVs).toBe(3000);
  });

  it('exposes a speed constraint as managed speed without vertical VNAV pitch guidance', () => {
    const s = createInitialState(B737_800_SPEC);
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '',
      route: 'KSEA WPT1',
      waypoints: [{
        ident: 'WPT1',
        lat: 47.5,
        lon: -122.31,
        discontinuity: false,
        speedConstraint: { type: 'AT_OR_BELOW', speed: 220 },
      }],
    };

    const v = computeVNAV(s, fp, navOut) as ReturnType<typeof computeVNAV> & {
      managedSpeedKt?: number;
      managedSpeedSource?: string;
    };

    expect(v.available).toBe(true);
    expect(v.speedConstraint).toBe(true);
    expect(v.targetSpeedKt).toBe(220);
    expect(v.managedSpeedKt).toBe(220);
    expect(v.managedSpeedSource).toBe('VNAV_SPEED_CONSTRAINT');
    expect(v.altitudeConstraint).toBe(false);
    expect(v.verticalMode).toBeNull();
    expect(v.lifecycle).toBe('SPEED_ONLY');
  });

  it('arms VNAV for a future descent constraint before TOD instead of requiring the active waypoint to be constrained', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 30000;
    s.velocity.u = 128.6;

    const v = computeVNAV(s, routeWithFutureDescentConstraint(), {
      ...navOut,
      activeWaypointIndex: 1,
      alongTrackDist: 160 * M_PER_NM,
    }) as ReturnType<typeof computeVNAV> & {
      lifecycle?: string;
      targetWaypointIdent?: string;
      targetWaypointIndex?: number;
      distanceToTodNm?: number;
    };

    expect(v.available).toBe(true);
    expect(v.lifecycle).toBe('ARMED');
    expect(v.verticalMode).toBeNull();
    expect(v.verticalArmedMode).toBe('VNAV');
    expect(v.targetAlt).toBe(12000);
    expect(v.targetWaypointIdent).toBe('BTG');
    expect(v.targetWaypointIndex).toBe(2);
    expect(v.targetVs).toBe(0);
    expect(v.distanceToTodNm).toBeGreaterThan(25);
  });

  it('captures VNAV_PTH at TOD for a descent constraint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 18000;
    s.velocity.u = 128.6;
    const distanceToTodM = ((s.position.alt - 12000) / DESCENT_PATH_FT_PER_NM) * M_PER_NM;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: 'TST215',
      route: 'KSEA TOD',
      waypoints: [{
        ident: 'TOD',
        lat: 47.5,
        lon: -122.31,
        discontinuity: false,
        altitudeConstraint: { type: 'AT_OR_BELOW', altitude: 12000 },
      }],
    };

    const v = computeVNAV(s, fp, { ...navOut, alongTrackDist: distanceToTodM }) as ReturnType<typeof computeVNAV> & {
      lifecycle?: string;
      distanceToTodNm?: number;
    };

    expect(v.available).toBe(true);
    expect(v.lifecycle).toBe('PATH');
    expect(v.verticalMode).toBe('VNAV_PTH');
    expect(v.targetAlt).toBe(12000);
    expect(v.targetVs).toBeLessThan(-1000);
    expect(Math.abs(v.distanceToTodNm ?? Number.NaN)).toBeLessThan(0.25);
  });

  it('reports route-complete VNAV lifecycle without falling back to another target', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 12020;
    s.velocity.u = 128.6;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: 'TST216',
      route: 'KSEA KPDX',
      waypoints: [{ ident: 'KPDX', lat: 45.59, lon: -122.6, discontinuity: false, altitudeConstraint: { type: 'AT', altitude: 12000 } }],
    };

    const v = computeVNAV(s, fp, { ...navOut, activeWaypointIndex: 0, alongTrackDist: 0, waypointReached: true }) as ReturnType<typeof computeVNAV> & {
      lifecycle?: string;
    };

    expect(v.available).toBe(false);
    expect(v.lifecycle).toBe('COMPLETE');
    expect(v.unavailableReason).toMatch(/route complete/i);
    expect(v.verticalMode).toBeNull();
    expect(v.targetAlt).toBe(s.position.alt);
    expect(v.targetAltitudeSource).toBeUndefined();
  });

  it('reports VNAV available for a constrained KSEA sample route waypoint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 18000;
    s.velocity.u = 128.6;
    const fp = createKseaKpdxFlight();
    const btgIndex = fp.waypoints.findIndex((waypoint) => waypoint.ident === 'BTG');

    const v = computeVNAV(s, fp, { ...navOut, activeWaypointIndex: btgIndex });

    expect(btgIndex).toBeGreaterThanOrEqual(0);
    expect(v.available).toBe(true);
    expect(v.unavailableReason).toBeNull();
    expect(v.altitudeConstraint).toBe(true);
    expect(v.speedConstraint).toBe(true);
    expect(v.targetAlt).toBe(12000);
    expect(v.targetSpeedKt).toBe(280);
  });

  it('reports VNAV_PTH while tracking a distant altitude constraint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 5000;
    s.velocity.u = 128.6;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '',
      route: 'KSEA WPT1',
      waypoints: [{
        ident: 'WPT1',
        lat: 47.5,
        lon: -122.31,
        discontinuity: false,
        altitudeConstraint: { type: 'AT', altitude: 10000 },
      }],
    };

    const v = computeVNAV(s, fp, navOut);

    expect(v.verticalMode).toBe('VNAV_PTH');
  });

  it('transitions from ALT* acquisition to ALT_HOLD near the VNAV target altitude', () => {
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: '',
      route: 'KSEA WPT1',
      waypoints: [{
        ident: 'WPT1',
        lat: 47.5,
        lon: -122.31,
        discontinuity: false,
        altitudeConstraint: { type: 'AT', altitude: 10000 },
      }],
    };
    const acquiring = createInitialState(B737_800_SPEC);
    acquiring.position.alt = 9875;
    acquiring.velocity.u = 128.6;
    const captured = createInitialState(B737_800_SPEC);
    captured.position.alt = 10020;
    captured.velocity.u = 128.6;

    expect(computeVNAV(acquiring, fp, navOut).verticalMode).toBe('ALT*');
    const capturedVnav = computeVNAV(captured, fp, navOut) as ReturnType<typeof computeVNAV> & {
      targetAltitudeSource?: string;
      captureTargetAltFt?: number;
    };
    expect(capturedVnav.verticalMode).toBe('ALT_HOLD');
    expect(capturedVnav.targetAlt).toBe(10000);
    expect(capturedVnav.targetAltitudeSource).toBe('VNAV_CONSTRAINT');
    expect(capturedVnav.captureTargetAltFt).toBe(10000);
  });
});
