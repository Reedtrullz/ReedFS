import { describe, expect, it } from 'vitest';
import { computeDerived } from '../derived';
import { isaAtAltitude } from '../atmosphere';
import { B737_800_SPEC, createInitialState } from '../../types';

describe('healthy air-data definitions', () => {
  it('agrees with the independently published FL290 250-CAS / Mach0.66 reference', () => {
    // FAA JO7110.65 5-7-3 note: rounded standard-day CAS/Mach reference,
    // not an aircraft performance gate. Exact pressure conversion is tested separately.
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = 29_000;
    state.velocity = { u: 0.66 * isaAtAltitude(29_000).speedOfSound, v: 0, w: 0 };
    const result = computeDerived(state);
    expect(result.ias).toBeGreaterThan(248);
    // Mach is rounded to .01 in the FAA note; exact modern conversion is 252.22 CAS.
    expect(result.ias).toBeLessThan(254);
  });

  it('uses scenario temperature for Mach and separates EAS, CAS and ideal IAS', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = 35_000; state.velocity = { u: 250, v: 0, w: 0 };
    const standard = computeDerived(state, null, { qnhHpa: 1013.25, surfaceTemperatureC: 15 });
    const hot = computeDerived(state, null, { qnhHpa: 1013.25, surfaceTemperatureC: 35 });
    expect(hot.mach).toBeLessThan(standard.mach);
    expect(standard.cas).toBeGreaterThan(standard.eas + 10);
    expect(standard.ias).toBe(standard.cas);
    expect(hot.ias).toBeLessThan(standard.ias);
    expect(hot.gs).toBe(standard.gs);
  });

  it('marks a supersonic indication unsupported instead of publishing EAS as healthy IAS', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = 0; state.velocity = { u: 400, v: 0, w: 0 };
    const result = computeDerived(state);
    expect(result.airDataValid).toBe(false);
    expect(result.cas).toBe(null);
    expect(result.ias).toBe(0);
    expect(result.mach).toBeGreaterThan(1);
  });

  it('flags malformed weather rather than presenting an ISA fallback as healthy air data', () => {
    const state = createInitialState(B737_800_SPEC); state.velocity.u = 100;
    for (const qnhHpa of [0, -1, NaN, Infinity, 1e300]) {
      const result = computeDerived(state, null, { qnhHpa, surfaceTemperatureC: 15 });
      expect(result.airDataValid).toBe(false); expect(result.cas).toBeNull(); expect(result.ias).toBe(0);
    }
    expect(computeDerived(state, null, { qnhHpa: 1013.25, surfaceTemperatureC: 1e300 }).airDataValid).toBe(false);
  });
});
