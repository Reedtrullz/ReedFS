export interface SunPosition {
  azimuth: number;
  elevation: number;
}

/** Approximate geometric solar position; no refraction or ephemeris accuracy claim. */
export function computeSunPosition(lat: number, lon: number, utcMs: number): SunPosition {
  const rad = Math.PI / 180;
  const n = utcMs / 86400000 + 2440587.5 - 2451545.0;
  const meanLongitude = (280.46 + 0.9856474 * n) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360) * rad;
  const ecliptic = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * rad;
  const obliquity = 23.439 * rad;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(ecliptic));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(ecliptic), Math.cos(ecliptic));
  const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) * 15) * rad;
  const hourAngle = gmst + lon * rad - rightAscension;
  const latitude = lat * rad;
  const sineElevation = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sineElevation)));
  const azimuth = (Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude)) + Math.PI * 3) % (Math.PI * 2);
  return { azimuth, elevation };
}

export function daylightBlend(elevation: number): number {
  return Math.max(0, Math.min(1, (elevation * 180 / Math.PI + 6) / 12));
}

export function sunLightIntensity(elevation: number): {
  ambient: number;
  directional: number;
  color: string;
} {
  if (elevation < 0) return { ambient: 0.05, directional: 0, color: '#1a1a3a' };
  if (elevation < 0.2) {
    const t = elevation / 0.2;
    return { ambient: 0.1 + t * 0.3, directional: t * 0.5, color: '#ff8833' };
  }
  return { ambient: 0.4, directional: 0.8, color: '#ffffff' };
}
