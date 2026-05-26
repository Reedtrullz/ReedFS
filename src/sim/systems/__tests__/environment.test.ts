import { describe, expect, it } from 'vitest';
import { computeAirRelativeVelocity, computeGustNed } from '../environment';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { WindInfo } from '../../weather';

describe('computeAirRelativeVelocity', () => {
  it('returns a copy of ground velocity when no wind is present', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100;

    const air = computeAirRelativeVelocity(s, null);

    expect(air).toEqual(s.velocity);
    expect(air).not.toBe(s.velocity);
  });

  it('does not mutate aircraft ground velocity', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100;
    s.velocity.v = 0;
    s.velocity.w = 0;
    const wind: WindInfo = { dir: 180, speed: 20 };

    const before = structuredClone(s.velocity);
    const first = computeAirRelativeVelocity(s, wind);
    const second = computeAirRelativeVelocity(s, wind);

    expect(s.velocity).toEqual(before);
    expect(second).toEqual(first);
  });

  it('turns southbound wind from the south into a headwind', () => {
    const s = createInitialState(B737_800_SPEC); // initial heading is south (π)
    s.velocity.u = 100;
    const wind: WindInfo = { dir: 180, speed: 20 };

    const air = computeAirRelativeVelocity(s, wind);

    expect(air.u).toBeGreaterThan(s.velocity.u);
    expect(air.u).toBeCloseTo(100 + 20 * 0.514444, 6);
    expect(air.v).toBeCloseTo(0, 6);
    expect(air.w).toBeCloseTo(0, 6);
  });

  it('applies gusts only to air-relative velocity and never mutates ground velocity', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100;
    s.simTime = 12_345;
    const gustyWind: WindInfo = { dir: 180, speed: 20, gustSpeed: 35, gustSeed: 42 };
    const steadyWind: WindInfo = { dir: 180, speed: 20 };
    const before = structuredClone(s.velocity);

    const steady = computeAirRelativeVelocity(s, steadyWind);
    const gusty = computeAirRelativeVelocity(s, gustyWind);

    expect(s.velocity).toEqual(before);
    expect(gusty.u).not.toBeCloseTo(steady.u, 6);
  });

  it('computes seeded gust perturbations deterministically', () => {
    const wind: WindInfo = { dir: 210, speed: 12, gustSpeed: 28, gustSeed: 7 };

    const first = computeGustNed(wind, 30_000);
    const second = computeGustNed(wind, 30_000);
    const otherSeed = computeGustNed({ ...wind, gustSeed: 8 }, 30_000);

    expect(second).toEqual(first);
    expect(otherSeed).not.toEqual(first);
  });
});
