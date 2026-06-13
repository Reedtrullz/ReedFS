import { describe, it, expect, vi } from 'vitest';
import { fetchMetar, parseMetarWind, MetarData } from '../weather';

describe('parseMetarWind', () => {
  it('parses typical wind', () => {
    const m: MetarData = { windDir: 180, windSpeed: 15, temperature: 20, visibility: 9999, clouds: [], qnh: 1013 };
    const w = parseMetarWind(m);
    expect(w.dir).toBe(180);
    expect(w.speed).toBe(15);
  });

  it('parses gust speed when METAR data includes one', () => {
    const m: MetarData = { windDir: 180, windSpeed: 15, windGust: 28, temperature: 20, visibility: 9999, clouds: [], qnh: 1013 };
    const w = parseMetarWind(m);

    expect(w.dir).toBe(180);
    expect(w.speed).toBe(15);
    expect(w.gustSpeed).toBe(28);
  });

  it('handles zero wind', () => {
    const m: MetarData = { windDir: 0, windSpeed: 0, temperature: 15, visibility: 9999, clouds: [], qnh: 1013 };
    const w = parseMetarWind(m);
    expect(w.speed).toBe(0);
  });

  it('adds scenario-authored gust seed to parsed wind for deterministic turbulence', () => {
    const m: MetarData = { windDir: 250, windSpeed: 12, windGust: 21, temperature: 18, visibility: 9999, clouds: [], qnh: 1008 };
    const parseWithScenarioSeed = parseMetarWind as (metar: MetarData, metadata?: { gustSeed: number }) => ReturnType<typeof parseMetarWind>;

    const w = parseWithScenarioSeed(m, { gustSeed: 9403 });

    expect(w).toEqual(expect.objectContaining({ dir: 250, speed: 12, gustSpeed: 21, gustSeed: 9403 }));
  });
});

describe('fetchMetar', () => {
  it('does not call the browser-blocked METAR endpoint without a configured proxy', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(fetchMetar('KSEA')).resolves.toBeNull();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
