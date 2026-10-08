import type { SunPosition } from '../sim/sun';

export function enuDirectionEcef(lat: number, lon: number, east: number, north: number, up: number) {
  const phi = lat * Math.PI / 180; const lambda = lon * Math.PI / 180;
  return {
    x: -east * Math.sin(lambda) - north * Math.sin(phi) * Math.cos(lambda) + up * Math.cos(phi) * Math.cos(lambda),
    y: east * Math.cos(lambda) - north * Math.sin(phi) * Math.sin(lambda) + up * Math.cos(phi) * Math.sin(lambda),
    z: north * Math.cos(phi) + up * Math.sin(phi),
  };
}

export function solarDirectionEcef(lat: number, lon: number, sun: SunPosition) {
  return enuDirectionEcef(lat, lon, Math.sin(sun.azimuth) * Math.cos(sun.elevation),
    Math.cos(sun.azimuth) * Math.cos(sun.elevation), Math.sin(sun.elevation));
}
