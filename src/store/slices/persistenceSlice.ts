import { normalizeAircraftConfig } from '../../sim/types';
import { buildGuidanceState } from '../../sim/guidanceState';
import { composeControlsSlice } from '../../sim/simulationStep';
import { createAutopilotControllerState } from '../../sim/systems/autopilot';
import { createInputManagerState } from '../../input/InputManager';
import { scenarioById } from '../../sim/scenarios';
import type { SimStatus, SimStore } from '../simStore';
import { normalizeControlInputs } from '../simStoreInputReducers';
import {
  DEFAULT_SCENARIO_SAVE_SLOT_ID,
  createScenarioSnapshot,
  listScenarioSaveSlots,
  loadScenarioSnapshot,
  saveScenarioSnapshot,
  scenarioSaveSlotIdFromName,
  type ScenarioPersistenceStorage,
  type ScenarioSaveOptions,
  type ScenarioSnapshot,
} from '../scenarioPersistence';
import type { SimStoreSet } from './aircraftSlice';
import { createRouteState } from './routeSlice';

function defaultScenarioStorage(): ScenarioPersistenceStorage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

function restoreSnapshotSlice(snapshot: ScenarioSnapshot, slotName = 'Saved scenario'): Partial<SimStore> {
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
    ? `${slotName} loaded paused.`
    : `${slotName} loaded.`;

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

function requestedSlotId(options?: ScenarioSaveOptions): string {
  return options?.slotId?.trim() || scenarioSaveSlotIdFromName(options?.slotName ?? 'Default save');
}

function requestedSlotName(options?: ScenarioSaveOptions): string {
  return options?.slotName?.trim() || (requestedSlotId(options) === DEFAULT_SCENARIO_SAVE_SLOT_ID ? 'Default save' : requestedSlotId(options));
}

export function createPersistenceSlice(set: SimStoreSet): Pick<SimStore, 'saveScenarioState' | 'loadScenarioState' | 'refreshScenarioSaveSlots'> {
  return {
    saveScenarioState: (storage, options) => set((s) => {
      const targetStorage = storage ?? defaultScenarioStorage();
      if (!targetStorage) {
        return { scenarioPersistenceMessage: 'Scenario save unavailable: localStorage is not available.' };
      }

      try {
        const slotId = requestedSlotId(options);
        const existing = listScenarioSaveSlots(targetStorage).find((slot) => slot.id === slotId);
        const metadata = saveScenarioSnapshot(targetStorage, createScenarioSnapshot(s), {
          slotId,
          slotName: requestedSlotName(options),
          overwrite: options?.overwrite,
        });
        const overwritten = Boolean(existing) && Boolean(options?.overwrite);
        return {
          scenarioSaveSlots: listScenarioSaveSlots(targetStorage),
          scenarioPersistenceMessage: overwritten ? `${metadata.name} overwritten.` : `${metadata.name} saved.`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown storage error';
        return {
          scenarioSaveSlots: listScenarioSaveSlots(targetStorage),
          scenarioPersistenceMessage: `Scenario save failed: ${message}`,
        };
      }
    }),

    loadScenarioState: (storage, slotId) => set(() => {
      const targetStorage = storage ?? defaultScenarioStorage();
      if (!targetStorage) {
        return { scenarioPersistenceMessage: 'Ignored saved scenario: localStorage is not available.' };
      }

      const loaded = loadScenarioSnapshot(targetStorage, slotId);
      if (!loaded.ok) {
        return {
          scenarioSaveSlots: listScenarioSaveSlots(targetStorage),
          scenarioPersistenceMessage: `Ignored saved scenario: ${loaded.reason}.`,
        };
      }

      try {
        return {
          ...restoreSnapshotSlice(loaded.snapshot, loaded.metadata.id === DEFAULT_SCENARIO_SAVE_SLOT_ID ? 'Saved scenario' : loaded.metadata.name),
          scenarioSaveSlots: listScenarioSaveSlots(targetStorage),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'restore failed';
        return {
          scenarioSaveSlots: listScenarioSaveSlots(targetStorage),
          scenarioPersistenceMessage: `Ignored saved scenario: ${message}.`,
        };
      }
    }),

    refreshScenarioSaveSlots: (storage) => set(() => {
      const targetStorage = storage ?? defaultScenarioStorage();
      return { scenarioSaveSlots: targetStorage ? listScenarioSaveSlots(targetStorage) : [] };
    }),
  };
}
