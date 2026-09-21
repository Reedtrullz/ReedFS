import type { FlightPlan } from '@shared/types/fmc';
import type { RunwayReference } from '../../viewport/runwayData';
import {
  createRouteEditSession,
  createRouteSourceFromFlightPlan,
  directToWaypoint,
  executeRouteDraft,
  insertRouteDiscontinuity,
  undoRouteDraftOperation,
  type RouteEditSession,
} from '../../sim/fms/routeAdapter';
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

function routeEditSessionFor(fp: FlightPlan): RouteEditSession {
  return createRouteEditSession(
    createRouteSourceFromFlightPlan(fp, {
      id: 'store-owned',
      type: 'rfms',
      label: 'Store-owned route',
      limitations: ['Staged edits apply only after EXEC'],
    }),
  );
}

export function createRouteSlice(set: SimStoreSet): Pick<SimStore, 'setFlightPlan' | 'setFlightPlanAtRunway' | 'setWind' | 'setWeather' | 'stageDirectTo' | 'stageInsertDiscontinuity' | 'undoRouteEditOperation' | 'executeRouteEdit'> {
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
        routeEditSession: fp ? routeEditSessionFor(fp) : null,
        routeEditMessage: null,
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
        routeEditSession: routeEditSessionFor(fp),
        routeEditMessage: null,
        activeLegIndex,
        routeStatus,
        wind: { dir: Math.round(originRunway.headingDeg), speed: 0, gustSeed: gustSeedForRunway(originRunway) },
        asyncPhysicsGeneration: s.asyncPhysicsGeneration + 1,
        asyncPhysicsInFlight: false,
        controlFeedbackMessage: null,
        guidance: syncGuidanceState(s.guidance, scenario, 'stopped', aircraft, controlsSlice.effectiveControls),
      };
    }),

    setWind: (w) => set({ wind: w }),
    setWeather: (w) => set({ weather: w }),

    stageDirectTo: (ident) => set((s) => {
      if (!s.routeEditSession || !ident.trim()) {
        return { routeEditMessage: 'Route edit unavailable: no route loaded' };
      }
      try {
        return {
          routeEditSession: directToWaypoint(s.routeEditSession, ident.trim()),
          routeEditMessage: null,
        };
      } catch (error) {
        return { routeEditMessage: error instanceof Error ? error.message : 'DIRECT_TO failed' };
      }
    }),

    stageInsertDiscontinuity: (afterIndex) => set((s) => {
      if (!s.routeEditSession) {
        return { routeEditMessage: 'Route edit unavailable: no route loaded' };
      }
      return {
        routeEditSession: insertRouteDiscontinuity(s.routeEditSession, afterIndex),
        routeEditMessage: null,
      };
    }),

    undoRouteEditOperation: () => set((s) => {
      if (!s.routeEditSession) return {};
      return {
        routeEditSession: undoRouteDraftOperation(s.routeEditSession),
        routeEditMessage: null,
      };
    }),

    executeRouteEdit: () => set((s) => {
      const session = s.routeEditSession;
      if (!session) return {};
      if (!session.draft) {
        return { routeEditMessage: 'No staged route edits to execute' };
      }
      const executed = executeRouteDraft(session);
      const fp = executed.active;
      const { activeLegIndex, routeStatus } = createRouteState(s, fp);
      const controlsSlice = composeControlsSlice(s.pilotInputs, s.apCommands, s.apState, {
        aircraft: s.aircraft,
        flightPlan: fp,
        routeStatus,
      });
      const scenario = scenarioById(s.selectedScenarioId);
      return {
        routeEditSession: executed,
        routeEditMessage: null,
        flightPlan: fp,
        activeLegIndex,
        routeStatus,
        ...controlsSlice,
        guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, controlsSlice.effectiveControls),
      };
    }),
  };
}
