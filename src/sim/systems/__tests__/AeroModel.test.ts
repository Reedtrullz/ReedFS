import { describe, it, expect } from 'vitest';
import { B737_AERO } from '../AeroModel';

describe('B737_AERO', () => {
  it('has sensible lift parameters', () => {
    expect(B737_AERO.cl0).toBeGreaterThan(0);
    expect(B737_AERO.clAlpha).toBeGreaterThan(1);
    expect(B737_AERO.flapClIncrements.length).toBeGreaterThan(0);
  });
  it('has drag parameters', () => {
    expect(B737_AERO.cd0).toBeGreaterThan(0);
    expect(B737_AERO.oswaldEfficiency).toBeGreaterThan(0.5);
  });
  it('has moment coefficients', () => {
    expect(B737_AERO.cmAlpha).toBeLessThan(0); // stable
    expect(B737_AERO.clBeta).toBeLessThan(0);  // dihedral
    expect(B737_AERO.cnBeta).toBeGreaterThan(0); // weathervane
  });
});
