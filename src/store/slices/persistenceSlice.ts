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
  deleteScenarioSaveSlot,
  scenarioSaveSlotIdFromName,
  type ScenarioPersistenceStorage,
  type ScenarioSaveOptions,
  type ScenarioSnapshot,
} from '../scenarioPersistence';
import type { SimStoreSet } from './aircraftSlice';
import { cloneWeather } from './aircraftSlice';
import { levelEquilibriumReceiptForScenario } from '../levelEquilibrium';
import { createRouteState } from './routeSlice';
import { withBrowserScenarioSaveLock } from '../browserScenarioStorage';

function defaultScenarioStorage(): ScenarioPersistenceStorage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

export function restoreSnapshotSlice(snapshot: ScenarioSnapshot, slotName = 'Saved scenario'): Partial<SimStore> {
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
    weather: cloneWeather(snapshot.weather ?? scenario.weather),
    weatherRestored: true,
    levelEquilibriumReceipt: levelEquilibriumReceiptForScenario(scenario),
    guidance: buildGuidanceState({
      scenario,
      status: restoredStatus,
      aircraft,
      controls: controlsSlice.effectiveControls,
    }),
    scenarioPersistenceMessage: `${scenarioPersistenceMessage} ${snapshot.weather === undefined
      ? 'Legacy save has no atmosphere record; scenario defaults restored.'
      : 'Saved weather retained until reset or scenario selection.'}${snapshot.version < 4
      ? ' Legacy clock mapped to 24 September 2026 UTC; previous date and atmosphere model cannot be reproduced.' : ''}`,
  };
}

function requestedSlotId(options?: ScenarioSaveOptions): string {
  return options?.slotId?.trim() || scenarioSaveSlotIdFromName(options?.slotName ?? 'Default save');
}

function requestedSlotName(options?: ScenarioSaveOptions): string {
  return options?.slotName?.trim() || (requestedSlotId(options) === DEFAULT_SCENARIO_SAVE_SLOT_ID ? 'Default save' : requestedSlotId(options));
}

export function createPersistenceSlice(set: SimStoreSet, get: () => SimStore): Pick<SimStore, 'saveScenarioState' | 'loadScenarioState' | 'refreshScenarioSaveSlots' | 'pendingScenarioSave' | 'discardPendingScenarioSave' | 'deleteScenarioSaveState'> {
  let saveAttempt = 0;
  const reportFailure = (error: unknown, snapshot?: ScenarioSnapshot) => {
    set({
      ...(snapshot ? { pendingScenarioSave: snapshot } : {}),
      scenarioPersistenceMessage: `Scenario save failed: ${typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : 'storage unavailable'}`,
    });
  };
  return {
    pendingScenarioSave: null,
    discardPendingScenarioSave: () => { saveAttempt++; set({ pendingScenarioSave: null, scenarioPersistenceMessage: 'Pending save discarded. Existing saves preserved.' }); },
    saveScenarioState: (storage, options) => {
      if (get().pendingScenarioSave) {
        set({ scenarioPersistenceMessage: 'Export or discard the pending save before saving another payload.' });
        return Promise.resolve(false);
      }
      let snapshot: ScenarioSnapshot;
      try { snapshot = createScenarioSnapshot(get()); }
      catch (error) { reportFailure(error); return Promise.resolve(false); }
      const attempt = ++saveAttempt;
      set({ pendingScenarioSave: snapshot });
      const failed = (error: unknown) => { if (attempt === saveAttempt) reportFailure(error, snapshot); };
      const save = (targetStorage: ScenarioPersistenceStorage) => {
        if (attempt !== saveAttempt) return;
        const slotId = requestedSlotId(options);
        const existing = listScenarioSaveSlots(targetStorage).find((slot) => slot.id === slotId);
        if (!storage && existing && options?.overwrite && options.expectedRevision === undefined) throw new Error('Review the current slot before confirming overwrite');
        const metadata = saveScenarioSnapshot(targetStorage, snapshot, {
          slotId, slotName: requestedSlotName(options), overwrite: options?.overwrite, expectedRevision: options?.expectedRevision,
        });
        set({
          pendingScenarioSave: null,
          scenarioSaveSlots: listScenarioSaveSlots(targetStorage),
          scenarioPersistenceMessage: existing && options?.overwrite ? `${metadata.name} overwritten.` : `${metadata.name} saved.`,
        });
      };
      if (storage) {
        try { save(storage); return Promise.resolve(true); } catch (error) { failed(error); return Promise.resolve(false); }
      } else {
        set({ scenarioPersistenceMessage: 'Waiting for save lock…' });
        return withBrowserScenarioSaveLock(save).then(() => attempt === saveAttempt && !get().pendingScenarioSave)
          .catch((error) => { failed(error); return false; });
      }
    },
    deleteScenarioSaveState: (slotId, expectedRevision) => {
      set({ scenarioPersistenceMessage: 'Waiting for save lock…' });
      void withBrowserScenarioSaveLock((storage) => {
        deleteScenarioSaveSlot(storage, slotId, expectedRevision);
        set({ scenarioSaveSlots: listScenarioSaveSlots(storage), scenarioPersistenceMessage: 'Saved slot deleted.' });
      }).catch((error) => reportFailure(error));
    },

    loadScenarioState: (storage, slotId) => set((s) => {
      let targetStorage: ScenarioPersistenceStorage | null;
      try { targetStorage = storage ?? defaultScenarioStorage(); }
      catch (error) { return { scenarioPersistenceMessage: `Ignored saved scenario: ${error instanceof Error ? error.message : 'storage access denied'}` }; }
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
          weatherEpoch: s.weatherEpoch + 1,
          asyncPhysicsGeneration: s.asyncPhysicsGeneration + 1,
          asyncPhysicsInFlight: false,
          lastValidCheckpoint: loaded.snapshot,
          simulationFailure: s.simulationFailure ? { ...s.simulationFailure, recovered: true } : null,
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
      try {
        const targetStorage = storage ?? defaultScenarioStorage();
        return { scenarioSaveSlots: targetStorage ? listScenarioSaveSlots(targetStorage) : [] };
      } catch { return { scenarioPersistenceMessage: 'Saved slots unavailable: storage access denied.' }; }
    }),
  };
}
