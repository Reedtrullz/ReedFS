import { describe, expect, it } from 'vitest';
import { calibratedAirspeedMs, impactPressureFromMach, machFromImpactPressure, trueAirspeedFromCasMs } from '../airData';
import { atmosphereForDensityAltitude } from '../atmosphere';
import { ktToMs, msToKt } from '../units';

describe('independent NACA-TR-837 subsonic pitot references', () => {
  // Table IV (printed p15): pressure ratio is dimensionless; printed resolution
  // is 0.0001 Mach (the .5 entry is below the modern result by .000059).
  it.each([[.1, .3715], [.2, .5171], [.5, .7836], [.8, .9562]])('q/p=%s agrees with published Mach=%s', (ratio, mach) => {
    expect(Math.abs(machFromImpactPressure(ratio * 50000, 50000)! - mach)).toBeLessThan(.0001);
  });
  // Table II (printed p13): 1946 knot uses 6080.2 ft/nmi. Modern 1852 m/nmi
  // and the table's rounded legacy constants justify a bounded 0.2% CAS difference.
  it.each([[100, 34.11], [150, 77.30], [200, 138.8], [250, 219.6], [300, 321.3], [400, 594.2]])('published CAS=%s knots / qc=%s psf', (cas, qc) => {
    const actual = calibratedAirspeedMs(qc * 47.88025898033584);
    expect(actual).not.toBeNull();
    expect(Math.abs(msToKt(actual!) / cas - 1)).toBeLessThan(.002);
  });

  it('has the incompressible low-speed limit without cancellation near zero', () => {
    const atmosphere = atmosphereForDensityAltitude(0);
    for (const mach of [0, 1e-8, 1e-5, .001]) {
      const impact = impactPressureFromMach(mach, atmosphere.pressurePa)!;
      expect(machFromImpactPressure(impact, atmosphere.pressurePa)).toBeCloseTo(mach, 12);
      if (mach > 0) {
        const dynamic = .5 * atmosphere.density * (mach * atmosphere.speedOfSound) ** 2;
        expect(Math.abs(impact / dynamic - 1)).toBeLessThan(1e-6);
      }
    }
  });

  it('round trips CAS through low and high subsonic conditions with the same weather atmosphere', () => {
    for (const altitude of [0, 10000, 35000]) for (const temperature of [-5, 15, 35]) for (const cas of [1, 100, 250]) {
      const atmosphere = atmosphereForDensityAltitude(altitude, { qnhHpa: 980, surfaceTemperatureC: temperature });
      const tas = trueAirspeedFromCasMs(ktToMs(cas), atmosphere)!;
      const impact = impactPressureFromMach(tas / atmosphere.speedOfSound, atmosphere.pressurePa)!;
      expect(msToKt(calibratedAirspeedMs(impact)!)).toBeCloseTo(cas, 9);
    }
  });

  it('rejects zero, negative, nonfinite pressure/impact and unsupported sonic domains', () => {
    for (const pressure of [0, -1, NaN, Infinity]) {
      expect(impactPressureFromMach(.5, pressure)).toBeNull();
      expect(machFromImpactPressure(100, pressure)).toBeNull();
    }
    for (const impact of [-1, NaN, Infinity]) expect(calibratedAirspeedMs(impact)).toBeNull();
    for (const mach of [-1, 1, 1.1, Infinity, NaN]) expect(impactPressureFromMach(mach, 101325)).toBeNull();
    expect(machFromImpactPressure(101325, 101325)).toBeNull();
    expect(trueAirspeedFromCasMs(200, { ...atmosphereForDensityAltitude(0), speedOfSound: 0 })).toBeNull();
  });
});
