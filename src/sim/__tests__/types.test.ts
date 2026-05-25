import { describe, it, expect } from 'vitest';
import { createInitialState, B737_800_SPEC } from '../types';

describe('createInitialState', () => {
  it('returns parked at KSEA with full fuel', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.position.lat).toBeCloseTo(47.45);
    expect(s.position.lon).toBeCloseTo(-122.31);
    expect(s.flightPhase).toBe('PARKED');
    expect(s.fuel.totalFuel).toBe(B737_800_SPEC.maxFuel);
    expect(s.engines[0].running).toBe(false);
  });

  it('body velocity starts at zero', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.velocity.u).toBe(0);
    expect(s.velocity.v).toBe(0);
    expect(s.velocity.w).toBe(0);
  });

  it('angular velocity starts at zero', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.angularVel.p).toBe(0);
    expect(s.angularVel.q).toBe(0);
    expect(s.angularVel.r).toBe(0);
  });
});
