import { describe, it, expect } from 'vitest';
import { geodeticToEcef, ecefToGeodetic, ecefToEnu, enuToEcef } from '../geodesy';

const KSEA = { lat: 47.45, lon: -122.31, alt: 132 }; // m MSL

describe('geodesy round-trip', () => {
  it('geodetic → ECEF → geodetic', () => {
    const ecef = geodeticToEcef(KSEA.lat, KSEA.lon, KSEA.alt);
    const geo = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(geo.lat).toBeCloseTo(KSEA.lat, 6);
    expect(geo.lon).toBeCloseTo(KSEA.lon, 6);
    expect(geo.alt).toBeCloseTo(KSEA.alt, 2);
  });

  it('ENU → ECEF → ENU is identity', () => {
    const ref = geodeticToEcef(KSEA.lat, KSEA.lon, 0);
    const enuIn = { e: 1000, n: 2000, u: 500 };
    const ecef = enuToEcef(enuIn, ref, KSEA.lat, KSEA.lon);
    const enuOut = ecefToEnu({ x: ecef.x, y: ecef.y, z: ecef.z }, ref, KSEA.lat, KSEA.lon);
    expect(enuOut.e).toBeCloseTo(enuIn.e, 1);
    expect(enuOut.n).toBeCloseTo(enuIn.n, 1);
    expect(enuOut.u).toBeCloseTo(enuIn.u, 1);
  });
});
