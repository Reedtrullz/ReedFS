import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { InputManagerState } from '../input/InputManager';
import type { AircraftState, AutopilotCommands, ControlInputs } from '../sim/types';
import type { AutopilotControllerState } from '../sim/systems/autopilot';
import type { WindInfo } from '../sim/weather';
import type { SimStatus, SimStore } from './simStore';

export const SCENARIO_SAVE_KEY = 'rfs.scenarioSnapshot.v1';
const SCENARIO_SAVE_VERSION = 2;
type ScenarioSaveVersion = 1 | typeof SCENARIO_SAVE_VERSION;

export type ScenarioPersistenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ScenarioSnapshot {
  version: ScenarioSaveVersion;
  savedAtIso: string;
  selectedScenarioId: string;
  status: SimStatus;
  aircraft: AircraftState;
  pilotInputs: ControlInputs;
  apCommands: AutopilotCommands;
  apControllerState?: AutopilotControllerState;
  inputManager: InputManagerState;
  apState: AutopilotState | null;
  flightPlan: FlightPlan | null;
  activeLegIndex: number | null;
  wind: WindInfo | null;
  simulationTimeSeconds: number;
}

export type ScenarioSnapshotLoadResult =
  | { ok: true; snapshot: ScenarioSnapshot }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSnapshot(value: unknown): value is ScenarioSnapshot {
  if (!isRecord(value)) return false;
  const supportedVersion = value.version === 1 || value.version === SCENARIO_SAVE_VERSION;
  const validControllerState = value.version === 1
    ? (value.apControllerState === undefined || isRecord(value.apControllerState))
    : isRecord(value.apControllerState);
  return (
    supportedVersion &&
    typeof value.savedAtIso === 'string' &&
    typeof value.selectedScenarioId === 'string' &&
    typeof value.status === 'string' &&
    isRecord(value.aircraft) &&
    isRecord(value.pilotInputs) &&
    isRecord(value.apCommands) &&
    validControllerState &&
    isRecord(value.inputManager) &&
    (value.apState === null || isRecord(value.apState)) &&
    (value.flightPlan === null || isRecord(value.flightPlan)) &&
    (value.activeLegIndex === null || typeof value.activeLegIndex === 'number') &&
    (value.wind === null || isRecord(value.wind)) &&
    typeof value.simulationTimeSeconds === 'number'
  );
}

export function createScenarioSnapshot(state: SimStore): ScenarioSnapshot {
  return structuredClone({
    version: SCENARIO_SAVE_VERSION,
    savedAtIso: new Date().toISOString(),
    selectedScenarioId: state.selectedScenarioId,
    status: state.status,
    aircraft: state.aircraft,
    pilotInputs: state.pilotInputs,
    apCommands: state.apCommands,
    apControllerState: state.apControllerState,
    inputManager: state.inputManager,
    apState: state.apState,
    flightPlan: state.flightPlan,
    activeLegIndex: state.activeLegIndex,
    wind: state.wind,
    simulationTimeSeconds: state.simulationTimeSeconds,
  });
}

export function saveScenarioSnapshot(storage: ScenarioPersistenceStorage, snapshot: ScenarioSnapshot): void {
  storage.setItem(SCENARIO_SAVE_KEY, JSON.stringify(snapshot));
}

export function loadScenarioSnapshot(storage: ScenarioPersistenceStorage): ScenarioSnapshotLoadResult {
  const raw = storage.getItem(SCENARIO_SAVE_KEY);
  if (!raw) return { ok: false, reason: 'no saved scenario state found' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid saved scenario JSON' };
  }

  if (!isValidSnapshot(parsed)) {
    return { ok: false, reason: 'saved scenario has an unsupported shape or version' };
  }

  return { ok: true, snapshot: parsed };
}
