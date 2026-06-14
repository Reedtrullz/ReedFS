import { normalizeAircraftConfig } from '../../sim/types';
import { buildGuidanceState } from '../../sim/guidanceState';
import { composeControlsSlice } from '../../sim/simulationStep';
import { createAutopilotControllerState } from '../../sim/systems/autopilot';
import { createInputManagerState } from '../../input/InputManager';
import { scenarioById } from '../../sim/scenarios';
import type { SimStatus, SimStore } from '../simStore';
import { normalizeControlInputs } from '../simStoreInputReducers';
import {
  createScenarioSnapshot,
  loadScenarioSnapshot,
  saveScenarioSnapshot,
  type ScenarioPersistenceStorage,
  type ScenarioSnapshot,
} from '../scenarioPersistence';
import type { SimStoreSet } from './aircraftSlice';
import { createRouteState } from './routeSlice';

function defaultScenarioStorage(): ScenarioPersistenceStorage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

function restoreSnapshotSlice(snapshot: ScenarioSnapshot): Partial<SimStore> {
  const aircraft = structuredClone(snapshot.aircraft);
  aircraft.config = normalizeAircraftConfig(aircraft.config);
  const apState = structuredClone(snapshot.apState);
  const apControllerState = structuredClone(snapshot.apControllerState ?? createAutopilotControllerState());
  const apCommands = structuredClone(snapshot.apCommands);
  const pilotInputs = normalizeControlInputs(structuredClone(snapshot.pilotInputs));
  const flightPlan = structuredClone(snapshot.flightPlan);
  const routeSlice = createRouteState({ aircraft }, flightPlan, snapshot.activeLegIndex);
  const controlsSlice = composeControlsSlice(pilotInputs, apCommands, apState, { aircraft, flightPlan, routeStatus: routeSlice.routeStatus });
  const scenario = scenarioById(snapshot.selectedScenarioId);
  const restoredStatus: SimStatus = snapshot.status === 'running' ? 'paused' : snapshot.status;
  const scenarioPersistenceMessage = snapshot.status === 'running'
    ? 'Saved scenario loaded paused.'
    : 'Saved scenario loaded.';

  return {
    selectedScenarioId: scenario.id,
    aircraft,
    ...controlsSlice,
    inputManager: createInputManagerState({
      ...structuredClone(snapshot.inputManager),
      leftBrake: 0,
      rightBrake: 0,
    }),
    status: restoredStatus,
    lastFrameTime: 0,
    fixedStepAccumulatorSeconds: 0,
    simulationTimeSeconds: snapshot.simulationTimeSeconds,
    droppedSimulationTimeSeconds: 0,
    apState,
    apControllerState,
    flightPlan,
    activeLegIndex: routeSlice.routeStatus.activeLegIndex,
    routeStatus: routeSlice.routeStatus,
    wind: structuredClone(snapshot.wind),
    guidance: buildGuidanceState({
      scenario,
      status: restoredStatus,
      aircraft,
      controls: controlsSlice.effectiveControls,
    }),
    scenarioPersistenceMessage,
  };
}

export function createPersistenceSlice(set: SimStoreSet): Pick<SimStore, 'saveScenarioState' | 'loadScenarioState'> {
  return {
    saveScenarioState: (storage) => set((s) => {
      const targetStorage = storage ?? defaultScenarioStorage();
      if (!targetStorage) {
        return { scenarioPersistenceMessage: 'Scenario save unavailable: localStorage is not available.' };
      }

      try {
        saveScenarioSnapshot(targetStorage, createScenarioSnapshot(s));
        return { scenarioPersistenceMessage: 'Scenario state saved.' };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown storage error';
        return { scenarioPersistenceMessage: `Scenario save failed: ${message}` };
      }
    }),

    loadScenarioState: (storage) => set(() => {
      const targetStorage = storage ?? defaultScenarioStorage();
      if (!targetStorage) {
        return { scenarioPersistenceMessage: 'Ignored saved scenario: localStorage is not available.' };
      }

      const loaded = loadScenarioSnapshot(targetStorage);
      if (!loaded.ok) {
        return { scenarioPersistenceMessage: `Ignored saved scenario: ${loaded.reason}.` };
      }

      try {
        return restoreSnapshotSlice(loaded.snapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'restore failed';
        return { scenarioPersistenceMessage: `Ignored saved scenario: ${message}.` };
      }
    }),
  };
}
