import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '../../store/simStore';
import { useScenarioWeather } from '../useScenarioWeather';
import type { MetarData } from '../../sim/weather';
import { createScenarioSnapshot } from '../../store/scenarioPersistence';
import { createKseaKpdxFlight } from '../../sim/flightPlanLoader';
import { KSEA_RUNWAY_16L } from '../../viewport/runwayData';

const { fetchMetar } = vi.hoisted(() => ({ fetchMetar: vi.fn() }));
vi.mock('../../sim/weather', async (original) => ({
  ...await original<typeof import('../../sim/weather')>(), fetchMetar,
}));

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null, key: (n) => [...values.keys()][n] ?? null,
    removeItem: (key) => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); },
  };
}

const liveMetar: MetarData = { windDir: 280, windSpeed: 20, windGust: 28,
  temperature: 25, qnh: 1030, visibility: 9000, clouds: [] };

beforeEach(() => {
  fetchMetar.mockReset();
  useSimStore.getState().discardPendingScenarioSave();
  useSimStore.getState().setScenario('enva-tutorial');
  useSimStore.getState().reset();
});
afterEach(cleanup);

async function saveConditions(target: Storage, scenario = 'enva-tutorial') {
  const store = useSimStore.getState();
  store.setScenario(scenario);
  store.setWeather({ ...useSimStore.getState().weather!, qnhHpa: 987, surfaceTemperatureC: -8,
    visibilityM: 2300, clouds: [{ cover: 'OVC', base: 900 }], cloudSeed: 12345 });
  store.setWind({ dir: 130, speed: 7, gustSpeed: 11, gustSeed: 54321 });
  store.start(); store.pause();
  expect(await store.saveScenarioState(target)).toBe(true);
  return structuredClone({ weather: useSimStore.getState().weather, wind: useSimStore.getState().wind });
}

describe('restored weather owns the active session', () => {
  it('rejects a late same-scenario METAR after restoring saved conditions', async () => {
    const target = storage(); const saved = await saveConditions(target);
    useSimStore.getState().reset();
    let finish!: (metar: MetarData) => void;
    fetchMetar.mockImplementation(() => new Promise<MetarData>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useScenarioWeather('enva-tutorial'));
    await act(async () => { useSimStore.getState().loadScenarioState(target); });
    const generation = useSimStore.getState().asyncPhysicsGeneration;
    await act(async () => { finish(liveMetar); });
    expect(useSimStore.getState().weather).toEqual(saved.weather);
    expect(useSimStore.getState().wind).toEqual(saved.wind);
    expect(useSimStore.getState().status).toBe('paused');
    expect(useSimStore.getState().asyncPhysicsGeneration).toBe(generation);
    expect(result.current.metarData).toMatchObject({ qnh: 987, temperature: -8, windDir: 130, windSpeed: 7 });
  });

  it('does not reseed or fetch when a different-scenario save restores before hook mounting', async () => {
    const target = storage(); const saved = await saveConditions(target, 'ksea-tutorial');
    useSimStore.getState().setScenario('enva-tutorial');
    useSimStore.getState().loadScenarioState(target);
    fetchMetar.mockResolvedValue(liveMetar);
    const { result } = renderHook(() => useScenarioWeather(useSimStore((s) => s.selectedScenarioId)));
    await act(async () => {});
    expect(useSimStore.getState().weather).toEqual(saved.weather);
    expect(useSimStore.getState().wind).toEqual(saved.wind);
    expect(fetchMetar).not.toHaveBeenCalled();
    expect(result.current.metarData.qnh).toBe(987);
  });

  it('reset of the same scenario starts a fresh request and ignores the earlier response', async () => {
    const responses: Array<(metar: MetarData) => void> = [];
    fetchMetar.mockImplementation(() => new Promise<MetarData>((resolve) => { responses.push(resolve); }));
    const { result } = renderHook(() => useScenarioWeather('enva-tutorial'));
    act(() => { useSimStore.getState().reset(); });
    expect(responses).toHaveLength(2);
    await act(async () => { responses[0](liveMetar); });
    expect(useSimStore.getState().weather?.qnhHpa).not.toBe(1030);
    await act(async () => { responses[1]({ ...liveMetar, qnh: 1004 }); });
    expect(useSimStore.getState().weather?.qnhHpa).toBe(1004);
    expect(result.current.metarData.qnh).toBe(1004);
  });

  it('checkpoint recovery fences a pending request and preserves its recorded weather', async () => {
    await saveConditions(storage());
    const checkpoint = createScenarioSnapshot(useSimStore.getState());
    useSimStore.getState().reset();
    let finish!: (metar: MetarData) => void;
    fetchMetar.mockImplementation(() => new Promise<MetarData>((resolve) => { finish = resolve; }));
    renderHook(() => useScenarioWeather('enva-tutorial'));
    act(() => {
      useSimStore.setState({ lastValidCheckpoint: checkpoint });
      useSimStore.getState().restoreLastValidCheckpoint();
    });
    await act(async () => { finish(liveMetar); });
    expect(useSimStore.getState().weather).toEqual(checkpoint.weather);
    expect(useSimStore.getState().wind).toEqual(checkpoint.wind);
    expect(useSimStore.getState().status).toBe('paused');
  });

  it('loading a runway route preserves the restored atmosphere and wind', async () => {
    const target = storage(); const saved = await saveConditions(target);
    useSimStore.getState().reset();
    useSimStore.getState().loadScenarioState(target);
    useSimStore.getState().setFlightPlanAtRunway(createKseaKpdxFlight(), KSEA_RUNWAY_16L);
    expect(useSimStore.getState().weather).toEqual(saved.weather);
    expect(useSimStore.getState().wind).toEqual(saved.wind);
    expect(useSimStore.getState().weatherRestored).toBe(true);
  });
});
