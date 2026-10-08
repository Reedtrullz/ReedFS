import { describe, expect, it } from 'vitest';
import { computeSunPosition, daylightBlend } from '../../sim/sun';
import { solarDirectionEcef } from '../solarDirection';

describe('Earth-fixed solar lighting', () => {
  it('maps local up, north and east into the independent equatorial axes', () => {
    const overhead = solarDirectionEcef(0, 0, { azimuth: 0, elevation: Math.PI / 2 });
    const north = solarDirectionEcef(0, 0, { azimuth: 0, elevation: 0 });
    const east = solarDirectionEcef(0, 0, { azimuth: Math.PI / 2, elevation: 0 });
    expect(overhead.x).toBeCloseTo(1, 12); expect(overhead.y).toBeCloseTo(0, 12); expect(overhead.z).toBeCloseTo(0, 12);
    expect(north.x).toBeCloseTo(0, 12); expect(north.y).toBeCloseTo(0, 12); expect(north.z).toBeCloseTo(1, 12);
    expect(east.x).toBeCloseTo(0, 12); expect(east.y).toBeCloseTo(1, 12); expect(east.z).toBeCloseTo(0, 12);
  });

  it('uses one Earth-fixed direction at the same instant across distant observer frames', () => {
    const utc = Date.UTC(2026, 8, 24, 12);
    const reference = solarDirectionEcef(0, 0, computeSunPosition(0, 0, utc));
    for (const [lat, lon] of [[47.45, -122.3], [63.46, 10.92], [-60, 180], [90, 0]]) {
      const direction = solarDirectionEcef(lat, lon, computeSunPosition(lat, lon, utc));
      expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 12);
      expect(Math.hypot(direction.x - reference.x, direction.y - reference.y, direction.z - reference.z)).toBeLessThan(1e-12);
    }
  });

  it('retains bounded night/day brightness and opposite seasonal hemispheres', () => {
    const summer = Date.UTC(2026, 5, 21, 12); const winter = Date.UTC(2026, 11, 21, 12);
    expect(computeSunPosition(60, 0, summer).elevation).toBeGreaterThan(0.8);
    expect(computeSunPosition(60, 0, winter).elevation).toBeLessThan(0.2);
    expect(computeSunPosition(-60, 0, winter).elevation).toBeGreaterThan(0.8);
    expect(daylightBlend(-Math.PI / 2)).toBe(0); expect(daylightBlend(Math.PI / 2)).toBe(1);
    expect(daylightBlend(-2.01 * Math.PI / 180)).toBeLessThan(daylightBlend(-1.99 * Math.PI / 180));
  });
});
