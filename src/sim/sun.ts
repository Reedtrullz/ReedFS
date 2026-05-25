export interface SunPosition {
  azimuth: number;
  elevation: number;
}

export function computeSunPosition(_lat: number, _lon: number, hour: number): SunPosition {
  const dayFraction = (hour - 6) / 12;
  const elevation = Math.sin(dayFraction * Math.PI) * (Math.PI / 3);
  const azimuth = (Math.PI / 2 + dayFraction * Math.PI) % (2 * Math.PI);
  return { azimuth, elevation: Math.max(-0.3, elevation) };
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
