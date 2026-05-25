export interface MetarData {
  windDir: number;
  windSpeed: number; // knots
  temperature: number; // °C
  visibility: number; // meters
  clouds: { cover: string; base: number }[]; // base in feet
  qnh: number; // hPa
}

export interface WindInfo {
  dir: number; // degrees true
  speed: number; // knots
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
    const data = await resp.json();
    if (!data.length) return null;
    const m = data[0];
    return {
      windDir: m.wdir ?? 0,
      windSpeed: m.wspd ?? 0,
      temperature: m.tmp ?? 15,
      visibility: m.visib ? parseInt(String(m.visib)) : 9999,
      clouds: (m.clouds ?? []).map((c: any) => ({
        cover: c.cover ?? '',
        base: (c.base ?? 0) * 100,
      })),
      qnh: m.altim ?? 1013.25,
    };
  } catch {
    return null;
  }
}
