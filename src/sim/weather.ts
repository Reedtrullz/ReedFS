export interface MetarData {
  windDir: number;
  windSpeed: number; // knots
  temperature: number; // °C
  visibility: number; // meters
  clouds: { cover: string; base: number }[]; // base in feet
  qnh: number; // hPa
}

export interface WindInfo {
  dir: number; // degrees true wind is FROM (METAR convention)
  speed: number; // knots
}

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrDefault(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function visibilityOrDefault(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseClouds(value: unknown): MetarData['clouds'] {
  if (!Array.isArray(value)) return [];
  return value.filter(isJsonObject).map((cloud) => ({
    cover: typeof cloud.cover === 'string' ? cloud.cover : '',
    base: numberOrDefault(cloud.base, 0) * 100,
  }));
}

export function parseMetarWind(m: MetarData): WindInfo {
  return { dir: m.windDir, speed: m.windSpeed };
}

export async function fetchMetar(icao: string): Promise<MetarData | null> {
  try {
    const resp = await fetch(
      `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`,
    );
    if (!resp.ok) return null;
    const data: unknown = await resp.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const m = data[0];
    if (!isJsonObject(m)) return null;
    return {
      windDir: numberOrDefault(m.wdir, 0),
      windSpeed: numberOrDefault(m.wspd, 0),
      temperature: numberOrDefault(m.tmp, 15),
      visibility: visibilityOrDefault(m.visib, 9999),
      clouds: parseClouds(m.clouds),
      qnh: numberOrDefault(m.altim, 1013.25),
    };
  } catch {
    return null;
  }
}
