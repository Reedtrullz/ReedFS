import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScenarioWeather } from '../useScenarioWeather';

const { mockSetWind, mockSetWeather, mockFetchMetar, mockStoreState } = vi.hoisted(() => ({
  mockSetWind: vi.fn(),
  mockSetWeather: vi.fn(),
  mockFetchMetar: vi.fn(),
  mockStoreState: { selectedScenarioId: 'enva-tutorial' },
}));

vi.mock('../../store/simStore', () => ({
  useSimStore: Object.assign(
    vi.fn((selector?: (state: typeof mockStoreState) => unknown) => (selector ? selector(mockStoreState) : mockStoreState)),
    { getState: vi.fn(() => ({ ...mockStoreState, setWind: mockSetWind, setWeather: mockSetWeather })) },
  ),
}));

vi.mock('../../sim/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../sim/weather')>();
  return { ...actual, fetchMetar: mockFetchMetar };
});

describe('useScenarioWeather QNH plumbing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.selectedScenarioId = 'enva-tutorial';
    mockFetchMetar.mockResolvedValue(null);
  });

  it('seeds store weather from the scenario fallback and updates it from live METAR', async () => {
    mockFetchMetar.mockResolvedValue({
      windDir: 180,
      windSpeed: 8,
      temperature: 22,
      visibility: 9000,
      clouds: [],
      qnh: 997,
    });
    renderHook(() => useScenarioWeather('enva-tutorial'));
    await waitFor(() => expect(mockSetWeather).toHaveBeenLastCalledWith(expect.objectContaining({ qnhHpa: 997, surfaceTemperatureC: 22 })));
  });
});
