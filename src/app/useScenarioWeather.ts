import { useEffect, useMemo, useState } from 'react';
import { useSimStore } from '../store/simStore';
import { scenarioById, type FlightScenario } from '../sim/scenarios';
import {
  fetchMetar,
  metarFromScenarioWeather,
  parseMetarWind,
  parseMetarWeather,
  type MetarData,
  type ScenarioWeatherMetadata,
} from '../sim/weather';

export interface ScenarioWeatherState {
  activeScenario: FlightScenario;
  metarData: MetarData;
  effectiveWeather: ScenarioWeatherMetadata;
}

export function useScenarioWeather(selectedScenarioId: string): ScenarioWeatherState {
  const activeScenario = scenarioById(selectedScenarioId);
  const weatherEpoch = useSimStore((s) => s.weatherEpoch);
  const weatherRestored = useSimStore((s) => s.weatherRestored);
  const storeWeather = useSimStore((s) => s.weather);
  const storeWind = useSimStore((s) => s.wind);
  const fallbackMetarData = useMemo(
    () => metarFromScenarioWeather(activeScenario.weather, activeScenario.wind),
    [activeScenario],
  );
  const weatherWindSeed = useMemo(
    () => ({ gustSeed: activeScenario.weather.gustSeed ?? activeScenario.weather.cloudSeed }),
    [activeScenario],
  );
  const [fetchedMetarData, setFetchedMetarData] = useState<{ scenarioId: string; epoch: number; metar: MetarData } | null>(null);
  const effectiveWeather = storeWeather ?? activeScenario.weather;
  const metarData = weatherRestored
    ? metarFromScenarioWeather(effectiveWeather, storeWind ?? { dir: 0, speed: 0 })
    : fetchedMetarData?.scenarioId === selectedScenarioId && fetchedMetarData.epoch === weatherEpoch
      ? fetchedMetarData.metar : fallbackMetarData;

  useEffect(() => {
    const scenario = activeScenario;
    if (weatherRestored) return;
    let cancelled = false;
    if (scenario.fixedWeatherPolicy === 'authored-calm') {
      useSimStore.getState().setWind(parseMetarWind(fallbackMetarData, weatherWindSeed));
      useSimStore.getState().setWeather(parseMetarWeather(fallbackMetarData, scenario.weather));
      return;
    }

    useSimStore.getState().setWind(parseMetarWind(fallbackMetarData, weatherWindSeed));
    useSimStore.getState().setWeather(parseMetarWeather(fallbackMetarData, scenario.weather));

    fetchMetar(scenario.weather.stationIcao).then((metar) => {
      const current = useSimStore.getState();
      if (cancelled || current.selectedScenarioId !== scenario.id || current.weatherEpoch !== weatherEpoch || current.weatherRestored) return;
      if (metar) {
        useSimStore.getState().setWind(parseMetarWind(metar, weatherWindSeed));
        useSimStore.getState().setWeather(parseMetarWeather(metar, scenario.weather));
        setFetchedMetarData({ scenarioId: scenario.id, epoch: weatherEpoch, metar });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeScenario, fallbackMetarData, weatherWindSeed, weatherEpoch, weatherRestored]);

  return { activeScenario, metarData, effectiveWeather };
}
