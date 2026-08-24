import type { FlightPlan } from '@shared/types/fmc';
import type { RunwayReference } from '../../viewport/runwayData';
import { B737_800_SPEC } from '../../sim/types';
import { composeControlsSlice, syncGuidanceState } from '../../sim/simulationStep';
import {
  computeRouteStatus,
  createNoRouteStatus,
  getInitialActiveLegIndex,
} from '../../sim/systems/navigation';
import { createAircraftStateForRunway, scenarioById } from '../../sim/scenarios';
import { createAutopilotControllerState } from '../../sim/systems/autopilot';
import { inputManagerForScenario, inputsForScenario } from '../simStoreInputReducers';
import type { SimStore } from '../simStore';
import type { SimStoreSet } from './aircraftSlice';

function gustSeedForRunway(runway: RunwayReference): number {
  const sourceIdSeed = runway.sourceId ? Number(runway.sourceId) % 10_000 : Number.NaN;
  return Number.isFinite(sourceIdSeed) ? sourceIdSeed : 7001;
}

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

export function createRouteSlice(set: SimStoreSet): Pick<SimStore, 'setFlightPlan' | 'setFlightPlanAtRunway' | 'setWind'> {
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

    setFlightPlanAtRunway: (fp: FlightPlan, originRunway: RunwayReference) => set((s) => {
      const scenario = scenarioById(s.selectedScenarioId);
      const aircraft = createAircraftStateForRunway(B737_800_SPEC, originRunway, scenario);
      const runwayStartTemplate = {
        ...scenario,
        flapSetting: 5,
        stabilizerTrimUnits: aircraft.config.stabilizerTrimUnits,
        initialAircraft: undefined,
      };
      const pilotInputs = inputsForScenario(runwayStartTemplate);
      const { activeLegIndex, routeStatus } = createRouteState({ aircraft }, fp);
      const controlsSlice = composeControlsSlice(pilotInputs, {}, null, {
        aircraft,
        flightPlan: fp,
        routeStatus,
      });
      const apControllerState = createAutopilotControllerState();
      return {
        aircraft,
        ...controlsSlice,
        inputManager: inputManagerForScenario(runwayStartTemplate),
        status: 'stopped',
        lastFrameTime: 0,
        fixedStepAccumulatorSeconds: 0,
        simulationTimeSeconds: 0,
        droppedSimulationTimeSeconds: 0,
        apState: null,
        apControllerState,
        flightPlan: fp,
        activeLegIndex,
        routeStatus,
        wind: { dir: Math.round(originRunway.headingDeg), speed: 0, gustSeed: gustSeedForRunway(originRunway) },
        controlFeedbackMessage: null,
        guidance: syncGuidanceState(s.guidance, scenario, 'stopped', aircraft, controlsSlice.effectiveControls),
      };
    }),

    setWind: (w) => set({ wind: w }),
  };
}
