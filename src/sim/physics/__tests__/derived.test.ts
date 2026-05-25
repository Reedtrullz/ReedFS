import { describe, it, expect } from 'vitest';
import { computeDerived } from '../derived';
import { createInitialState, B737_800_SPEC } from '../../types';

describe('computeDerived', () => {
  it('at rest, all zero', () => {
    const s = createInitialState(B737_800_SPEC);
    const d = computeDerived(s);
    expect(d.tas).toBe(0);
    expect(d.ias).toBe(0);
    expect(d.mach).toBe(0);
  });

  it('forward flight at sea level, 250kt', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6; // 250 kt in m/s
    const d = computeDerived(s);
    expect(d.tas).toBeCloseTo(250, -1);
    expect(d.ias).toBeCloseTo(250, -1);
    expect(d.aoa).toBeCloseTo(0);
  });

  it('climbing flight has positive vs', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    s.velocity.w = -10; // upward in NED (w negative = up)
    const d = computeDerived(s);
    expect(d.vs).toBeGreaterThan(1000); // climbing at 10m/s ≈ 1968 fpm
  });

  it('computes ground speed from attitude-aware NED velocity', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100;
    s.velocity.v = 0;
    s.velocity.w = 0;
    s.attitude.theta = Math.PI / 6; // 30° nose up means part of forward velocity is vertical

    const d = computeDerived(s);

    expect(d.gs).toBeCloseTo(100 * Math.cos(Math.PI / 6) * 1.94384, 0);
    expect(d.vs).toBeGreaterThan(9000);
  });
});
