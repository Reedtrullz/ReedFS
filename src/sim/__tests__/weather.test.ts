import { describe, it, expect, vi } from 'vitest';
import { fetchMetar, parseMetarWind, MetarData } from '../weather';

describe('parseMetarWind', () => {
  it('parses typical wind', () => {
    const m: MetarData = { windDir: 180, windSpeed: 15, temperature: 20, visibility: 9999, clouds: [], qnh: 1013 };
    const w = parseMetarWind(m);
    expect(w.dir).toBe(180);
    expect(w.speed).toBe(15);
  });

  it('handles zero wind', () => {
    const m: MetarData = { windDir: 0, windSpeed: 0, temperature: 15, visibility: 9999, clouds: [], qnh: 1013 };
    const w = parseMetarWind(m);
    expect(w.speed).toBe(0);
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
