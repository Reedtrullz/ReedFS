import { describe, it, expect } from 'vitest';
import { B737_AERO } from '../AeroModel';

describe('B737_AERO', () => {
  it('defines explicit flap-detent polar tables for the usable 737 configurations', () => {
    expect(B737_AERO.flapPolars.map((polar) => polar.detent)).toEqual([0, 1, 5, 15, 30, 40]);

    for (const polar of B737_AERO.flapPolars) {
      expect(polar.alphaZeroLiftRad).toBeLessThan(0);
      expect(polar.clAlpha).toBeGreaterThan(4);
      expect(polar.clMax).toBeGreaterThan(1.4);
      expect(polar.cd0).toBeGreaterThan(0);
      expect(polar.k).toBeGreaterThan(0);
      expect(polar.stallDragRise).toBeGreaterThan(0);
    }
  });

  it('models flap deployment as higher CLmax and higher profile drag', () => {
    const clean = B737_AERO.flapPolars[0];
    const flaps5 = B737_AERO.flapPolars.find((polar) => polar.detent === 5)!;
    const flaps30 = B737_AERO.flapPolars.find((polar) => polar.detent === 30)!;

    expect(flaps5.clMax).toBeGreaterThan(clean.clMax);
    expect(flaps30.clMax).toBeGreaterThan(flaps5.clMax);
    expect(flaps5.cd0).toBeGreaterThan(clean.cd0);
    expect(flaps30.cd0).toBeGreaterThan(flaps5.cd0);
    expect(flaps30.deltaCm).toBeLessThan(flaps5.deltaCm);
  });

  it('has drag parameters', () => {
    expect(B737_AERO.gearCd).toBeGreaterThan(0);
    expect(B737_AERO.speedBrakeCd).toBeGreaterThan(0);
  });
  it('has moment coefficients', () => {
    expect(B737_AERO.cmAlpha).toBeLessThan(0); // stable
    expect(B737_AERO.clBeta).toBeLessThan(0);  // dihedral
    expect(B737_AERO.cnBeta).toBeGreaterThan(0); // weathervane
  });
});
