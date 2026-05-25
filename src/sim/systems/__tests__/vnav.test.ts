import { describe, it, expect } from 'vitest';
import { computeVNAV } from '../vnav';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { FlightPlan } from '@shared/types/fmc';

describe('computeVNAV', () => {
  it('returns defaults with no flight plan', () => {
    const s = createInitialState(B737_800_SPEC);
    const navOut = { crossTrackError: 0, alongTrackDist: 5000, desiredTrack: 0, activeWaypointIndex: 0, waypointReached: false };
    const v = computeVNAV(s, null, navOut);
    expect(v.altitudeConstraint).toBe(false);
    expect(v.targetVs).toBe(0);
  });

  it('computes required VS to meet altitude constraint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 5000;
    s.velocity.u = 128.6; // 250 kt
    const fp: FlightPlan = {
      origin: 'KSEA', destination: '', flightNumber: '', route: '',
      waypoints: [{
        ident: 'WPT1', lat: 47.5, lon: -122.31, discontinuity: false,
        altitudeConstraint: { type: 'AT', altitude: 10000 },
      }],
    };
    const navOut = { crossTrackError: 0, alongTrackDist: 18520, desiredTrack: 0, activeWaypointIndex: 0, waypointReached: false }; // 10 NM
    const v = computeVNAV(s, fp, navOut);
    expect(v.altitudeConstraint).toBe(true);
    expect(v.targetAlt).toBe(10000);
    // Need to climb 5000ft over 10NM at 250kt → VS ≈ 2083 fpm
    expect(v.targetVs).toBeGreaterThan(1500);
    expect(v.targetVs).toBeLessThan(3000);
  });
});
