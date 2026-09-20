import { describe, expect, it } from 'vitest';
import { baroIndicatedAltitudeFt } from '../selectors';

describe('baroIndicatedAltitudeFt', () => {
  it('shows higher indicated altitude under low QNH and lower under high QNH', () => {
    expect(baroIndicatedAltitudeFt(1000, 1013.25)).toBe(1000);
    expect(baroIndicatedAltitudeFt(1000, 1003)).toBe(1277);
    expect(baroIndicatedAltitudeFt(1000, 1023)).toBe(737);
  });

  it('is identity-safe for invalid inputs', () => {
    expect(baroIndicatedAltitudeFt(500, 0)).toBe(500);
    expect(baroIndicatedAltitudeFt(500, Number.NaN)).toBe(500);
  });
});
