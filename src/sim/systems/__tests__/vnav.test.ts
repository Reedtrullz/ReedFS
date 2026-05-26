import { describe, it, expect } from 'vitest';
import { computeVNAV } from '../vnav';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { FlightPlan } from '@shared/types/fmc';

const navOut = {
  crossTrackError: 0,
  alongTrackDist: 18520,
  desiredTrack: 0,
  activeWaypointIndex: 0,
  waypointReached: false,
};

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

  it('exposes a speed constraint as a VNAV target speed', () => {
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

    const v = computeVNAV(s, fp, navOut);

    expect(v.available).toBe(true);
    expect(v.speedConstraint).toBe(true);
    expect(v.targetSpeedKt).toBe(220);
    expect(v.altitudeConstraint).toBe(false);
  });
});
