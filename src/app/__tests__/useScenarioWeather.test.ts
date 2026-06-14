import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../../App.tsx?raw';
import rfsShellSource from '../RfsShell.tsx?raw';
import hookSource from '../useScenarioWeather.ts?raw';
import { useScenarioWeather } from '../useScenarioWeather';

const { mockSetWind, mockFetchMetar, mockStoreState } = vi.hoisted(() => ({
  mockSetWind: vi.fn(),
  mockFetchMetar: vi.fn(),
  mockStoreState: { selectedScenarioId: 'enva-tutorial' },
}));

vi.mock('../../store/simStore', () => ({
  useSimStore: Object.assign(
    vi.fn((selector?: (state: typeof mockStoreState) => unknown) => (selector ? selector(mockStoreState) : mockStoreState)),
    { getState: vi.fn(() => ({ ...mockStoreState, setWind: mockSetWind })) },
  ),
}));

vi.mock('../../sim/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../sim/weather')>();
  return {
    ...actual,
    fetchMetar: mockFetchMetar,
  };
});

describe('useScenarioWeather', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.selectedScenarioId = 'enva-tutorial';
    mockFetchMetar.mockResolvedValue(null);
  });

  it('moves scenario weather bootstrap and METAR fetching out of App.tsx', () => {
    expect(appSource).not.toMatch(/fetchMetar|parseMetarWind|metarFromScenarioWeather|setFetchedMetarData/);
    expect(rfsShellSource).toMatch(/useScenarioWeather/);
    expect(hookSource).toMatch(/fetchMetar|parseMetarWind|metarFromScenarioWeather/);
  });

  it('seeds deterministic fallback wind and METAR data for the selected scenario', async () => {
    const { result } = renderHook(() => useScenarioWeather('enva-tutorial'));

    expect(result.current.activeScenario.id).toBe('enva-tutorial');
    expect(result.current.metarData.windSpeed).toBe(0);
    await waitFor(() => expect(mockSetWind).toHaveBeenCalledWith(expect.objectContaining({ dir: 90, speed: 0, gustSeed: 9009 })));
    expect(mockFetchMetar).toHaveBeenCalledWith('ENVA');
  });

  it('adopts fetched METAR data only while the selected scenario remains current', async () => {
    mockFetchMetar.mockResolvedValue({
      windDir: 270,
      windSpeed: 12,
      windGust: 18,
      temperature: 5,
      visibility: 8000,
      clouds: [{ cover: 'BKN', base: 1800 }],
      qnh: 1008,
    });

    const { result } = renderHook(() => useScenarioWeather('enva-tutorial'));

    await waitFor(() => expect(result.current.metarData.windSpeed).toBe(12));
    expect(mockSetWind).toHaveBeenLastCalledWith(expect.objectContaining({ dir: 270, speed: 12, gustSpeed: 18, gustSeed: 9009 }));
  });
});
