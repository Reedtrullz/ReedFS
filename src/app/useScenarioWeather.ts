import { useEffect, useMemo, useState } from 'react';
import { useSimStore } from '../store/simStore';
import { scenarioById, type FlightScenario } from '../sim/scenarios';
import {
  fetchMetar,
  metarFromScenarioWeather,
  parseMetarWind,
  type MetarData,
} from '../sim/weather';

export interface ScenarioWeatherState {
  activeScenario: FlightScenario;
  metarData: MetarData;
}

export function useScenarioWeather(selectedScenarioId: string): ScenarioWeatherState {
  const activeScenario = scenarioById(selectedScenarioId);
  const fallbackMetarData = useMemo(
    () => metarFromScenarioWeather(activeScenario.weather, activeScenario.wind),
    [activeScenario],
  );
  const weatherWindSeed = useMemo(
    () => ({ gustSeed: activeScenario.weather.gustSeed ?? activeScenario.weather.cloudSeed }),
    [activeScenario],
  );
  const [fetchedMetarData, setFetchedMetarData] = useState<{ scenarioId: string; metar: MetarData } | null>(null);
  const metarData = fetchedMetarData?.scenarioId === selectedScenarioId ? fetchedMetarData.metar : fallbackMetarData;

  useEffect(() => {
    const scenario = activeScenario;
    let cancelled = false;

    useSimStore.getState().setWind(parseMetarWind(fallbackMetarData, weatherWindSeed));

    fetchMetar(scenario.weather.stationIcao).then((metar) => {
      if (cancelled || useSimStore.getState().selectedScenarioId !== scenario.id) return;
      if (metar) {
        useSimStore.getState().setWind(parseMetarWind(metar, weatherWindSeed));
        setFetchedMetarData({ scenarioId: scenario.id, metar });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeScenario, fallbackMetarData, weatherWindSeed]);

  return { activeScenario, metarData };
}
