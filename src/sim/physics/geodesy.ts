// WGS84 constants
const A = 6378137.0; // semi-major axis (m)
const F = 1 / 298.257223563; // flattening
const E2 = F * (2 - F); // first eccentricity squared

export interface Ecef { x: number; y: number; z: number; }
export interface Enu { e: number; n: number; u: number; }
export interface Geodetic { lat: number; lon: number; alt: number; }

function deg2rad(d: number) { return d * Math.PI / 180; }
function rad2deg(r: number) { return r * 180 / Math.PI; }

export function geodeticToEcef(lat: number, lon: number, alt: number): Ecef {
  const latR = deg2rad(lat);
  const lonR = deg2rad(lon);
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const x = (N + alt) * cosLat * Math.cos(lonR);
  const y = (N + alt) * cosLat * Math.sin(lonR);
  const z = (N * (1 - E2) + alt) * sinLat;
  return { x, y, z };
}

export function ecefToGeodetic(x: number, y: number, z: number): Geodetic {
  const p = Math.sqrt(x * x + y * y);
  const lon = Math.atan2(y, x);
  let lat = Math.atan2(z, p * (1 - E2));
  // Iterate for altitude (3 iterations for cm accuracy)
  for (let i = 0; i < 3; i++) {
    const sinLat = Math.sin(lat);
    const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
    const alt = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - E2 * N / (N + alt)));
  }
  const sinLat = Math.sin(lat);
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const alt = p / Math.cos(lat) - N;
  return { lat: rad2deg(lat), lon: rad2deg(lon), alt };
}

export function ecefToEnu(pos: Ecef, ref: Ecef, refLat: number, refLon: number): Enu {
  const latR = deg2rad(refLat);
  const lonR = deg2rad(refLon);
  const dx = pos.x - ref.x;
  const dy = pos.y - ref.y;
  const dz = pos.z - ref.z;
  const sinLat = Math.sin(latR), cosLat = Math.cos(latR);
  const sinLon = Math.sin(lonR), cosLon = Math.cos(lonR);
  return {
    e: -sinLon * dx + cosLon * dy,
    n: -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz,
    u: cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz,
  };
}

export function enuToEcef(enu: Enu, ref: Ecef, refLat: number, refLon: number): Ecef {
  const latR = deg2rad(refLat);
  const lonR = deg2rad(refLon);
  const sinLat = Math.sin(latR), cosLat = Math.cos(latR);
  const sinLon = Math.sin(lonR), cosLon = Math.cos(lonR);
  return {
    x: ref.x - sinLon * enu.e - sinLat * cosLon * enu.n + cosLat * cosLon * enu.u,
    y: ref.y + cosLon * enu.e - sinLat * sinLon * enu.n + cosLat * sinLon * enu.u,
    z: ref.z + cosLat * enu.n + sinLat * enu.u,
  };
}
