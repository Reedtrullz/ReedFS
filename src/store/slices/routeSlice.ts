import type { FlightPlan } from '@shared/types/fmc';
import { composeControlsSlice, syncGuidanceState } from '../../sim/simulationStep';
import {
  computeRouteStatus,
  createNoRouteStatus,
  getInitialActiveLegIndex,
} from '../../sim/systems/navigation';
import { scenarioById } from '../../sim/scenarios';
import type { SimStore } from '../simStore';
import type { SimStoreSet } from './aircraftSlice';

export function createRouteState(
  state: Pick<SimStore, 'aircraft'>,
  flightPlan: FlightPlan | null,
  activeLegIndex: number | null = getInitialActiveLegIndex(flightPlan),
) {
  const routeStatus = flightPlan ? computeRouteStatus(state.aircraft, flightPlan, activeLegIndex) : createNoRouteStatus();
  return {
    activeLegIndex,
    routeStatus,
  };
}

export function createRouteSlice(set: SimStoreSet): Pick<SimStore, 'setFlightPlan' | 'setWind'> {
  return {
    setFlightPlan: (fp) => set((s) => {
      const { activeLegIndex, routeStatus } = createRouteState(s, fp);
      const controlsSlice = composeControlsSlice(s.pilotInputs, s.apCommands, s.apState, {
        aircraft: s.aircraft,
        flightPlan: fp,
        routeStatus,
      });
      const scenario = scenarioById(s.selectedScenarioId);
      return {
        flightPlan: fp,
        activeLegIndex,
        routeStatus,
        ...controlsSlice,
        guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, controlsSlice.effectiveControls),
      };
    }),

    setWind: (w) => set({ wind: w }),
  };
}
