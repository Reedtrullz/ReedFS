import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { InputManagerState } from '../input/InputManager';
import type { AircraftState, AutopilotCommands, ControlInputs } from '../sim/types';
import type { AutopilotControllerState } from '../sim/systems/autopilot';
import type { WindInfo } from '../sim/weather';
import type { SimStatus, SimStore } from './simStore';

export const SCENARIO_SAVE_KEY = 'rfs.scenarioSnapshot.v1';
export const DEFAULT_SCENARIO_SAVE_SLOT_ID = 'default';
const SCENARIO_SAVE_VERSION = 2;
const SCENARIO_SAVE_COLLECTION_VERSION = 3;
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

export interface ScenarioSaveSlotMetadata {
  id: string;
  name: string;
  savedAtIso: string;
  selectedScenarioId: string;
  status: SimStatus;
  restoreStatus: SimStatus;
  routeSummary: string;
  simulationTimeSeconds: number;
}

export interface ScenarioSaveSlot {
  metadata: ScenarioSaveSlotMetadata;
  snapshot: ScenarioSnapshot;
}

export interface ScenarioSaveCollection {
  version: typeof SCENARIO_SAVE_COLLECTION_VERSION;
  slots: Record<string, ScenarioSaveSlot>;
}

export interface ScenarioSaveOptions {
  slotId?: string;
  slotName?: string;
  overwrite?: boolean;
}

export type ScenarioSnapshotLoadResult =
  | { ok: true; snapshot: ScenarioSnapshot; metadata: ScenarioSaveSlotMetadata }
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

function isSaveCollection(value: unknown): value is ScenarioSaveCollection {
  return isRecord(value) && value.version === SCENARIO_SAVE_COLLECTION_VERSION && isRecord(value.slots);
}

function isValidSlotMetadata(value: unknown): value is ScenarioSaveSlotMetadata {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.savedAtIso === 'string' &&
    typeof value.selectedScenarioId === 'string' &&
    typeof value.status === 'string' &&
    typeof value.restoreStatus === 'string' &&
    typeof value.routeSummary === 'string' &&
    typeof value.simulationTimeSeconds === 'number'
  );
}

export function scenarioSaveSlotIdFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length === 0 || slug === 'default-save') return DEFAULT_SCENARIO_SAVE_SLOT_ID;
  return slug;
}

function slotNameFromOptions(options?: ScenarioSaveOptions): string {
  const name = options?.slotName?.trim();
  if (name) return name;
  return options?.slotId === DEFAULT_SCENARIO_SAVE_SLOT_ID || !options?.slotId ? 'Default save' : options.slotId;
}

function slotIdFromOptions(options?: ScenarioSaveOptions): string {
  return options?.slotId?.trim() || scenarioSaveSlotIdFromName(slotNameFromOptions(options));
}

function restoreStatusFor(snapshot: ScenarioSnapshot): SimStatus {
  return snapshot.status === 'running' ? 'paused' : snapshot.status;
}

function routeSummaryFor(snapshot: ScenarioSnapshot): string {
  const plan = snapshot.flightPlan;
  if (!plan) return 'No route';
  const origin = typeof plan.origin === 'string' ? plan.origin : null;
  const destination = typeof plan.destination === 'string' ? plan.destination : null;
  return origin && destination ? `${origin} → ${destination}` : 'Route loaded';
}

function metadataForSnapshot(snapshot: ScenarioSnapshot, options?: ScenarioSaveOptions): ScenarioSaveSlotMetadata {
  const id = slotIdFromOptions(options);
  return {
    id,
    name: slotNameFromOptions({ ...options, slotId: id }),
    savedAtIso: snapshot.savedAtIso,
    selectedScenarioId: snapshot.selectedScenarioId,
    status: snapshot.status,
    restoreStatus: restoreStatusFor(snapshot),
    routeSummary: routeSummaryFor(snapshot),
    simulationTimeSeconds: snapshot.simulationTimeSeconds,
  };
}

function collectionWithSlot(snapshot: ScenarioSnapshot, options?: ScenarioSaveOptions): ScenarioSaveCollection {
  const metadata = metadataForSnapshot(snapshot, options);
  return {
    version: SCENARIO_SAVE_COLLECTION_VERSION,
    slots: {
      [metadata.id]: {
        metadata,
        snapshot,
      },
    },
  };
}

function migrateLegacySnapshot(storage: ScenarioPersistenceStorage, snapshot: ScenarioSnapshot): ScenarioSaveCollection {
  const collection = collectionWithSlot(snapshot, {
    slotId: DEFAULT_SCENARIO_SAVE_SLOT_ID,
    slotName: 'Default save',
    overwrite: true,
  });
  storage.setItem(SCENARIO_SAVE_KEY, JSON.stringify(collection));
  return collection;
}

function parseStoredSave(storage: ScenarioPersistenceStorage):
  | { ok: true; collection: ScenarioSaveCollection }
  | { ok: false; reason: string; empty?: true } {
  const raw = storage.getItem(SCENARIO_SAVE_KEY);
  if (!raw) return { ok: false, reason: 'no saved scenario state found', empty: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid saved scenario JSON' };
  }

  if (isSaveCollection(parsed)) return { ok: true, collection: parsed };
  if (isValidSnapshot(parsed)) return { ok: true, collection: migrateLegacySnapshot(storage, parsed) };
  return { ok: false, reason: 'saved scenario has an unsupported shape or version' };
}

function emptyCollection(): ScenarioSaveCollection {
  return { version: SCENARIO_SAVE_COLLECTION_VERSION, slots: {} };
}

function collectionForWrite(storage: ScenarioPersistenceStorage): ScenarioSaveCollection {
  const parsed = parseStoredSave(storage);
  return parsed.ok ? structuredClone(parsed.collection) : emptyCollection();
}

function slotFromCollection(collection: ScenarioSaveCollection, slotId: string): ScenarioSnapshotLoadResult {
  const rawSlot = collection.slots[slotId];
  if (!isRecord(rawSlot)) return { ok: false, reason: `no saved slot named ${slotId}` };
  const metadata = isValidSlotMetadata(rawSlot.metadata) ? rawSlot.metadata : null;
  const slotName = metadata?.name ?? slotId;
  if (!isValidSnapshot(rawSlot.snapshot)) {
    return { ok: false, reason: `saved slot "${slotName}" has an unsupported shape or version` };
  }
  if (!metadata) {
    return { ok: false, reason: `saved slot "${slotName}" has invalid metadata` };
  }
  return { ok: true, snapshot: rawSlot.snapshot, metadata };
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

export function saveScenarioSnapshot(
  storage: ScenarioPersistenceStorage,
  snapshot: ScenarioSnapshot,
  options?: ScenarioSaveOptions,
): ScenarioSaveSlotMetadata {
  const collection = collectionForWrite(storage);
  const metadata = metadataForSnapshot(snapshot, options);
  if (collection.slots[metadata.id] && !options?.overwrite) {
    throw new Error(`save slot "${metadata.name}" already exists; confirm overwrite to replace it`);
  }
  collection.slots[metadata.id] = {
    metadata,
    snapshot: structuredClone(snapshot),
  };
  storage.setItem(SCENARIO_SAVE_KEY, JSON.stringify(collection));
  return metadata;
}

export function loadScenarioSnapshot(
  storage: ScenarioPersistenceStorage,
  slotId = DEFAULT_SCENARIO_SAVE_SLOT_ID,
): ScenarioSnapshotLoadResult {
  const parsed = parseStoredSave(storage);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return slotFromCollection(parsed.collection, slotId);
}

export function listScenarioSaveSlots(storage: ScenarioPersistenceStorage): ScenarioSaveSlotMetadata[] {
  const parsed = parseStoredSave(storage);
  if (!parsed.ok) return [];
  return Object.values(parsed.collection.slots)
    .map((slot) => isRecord(slot) && isValidSlotMetadata(slot.metadata) ? slot.metadata : null)
    .filter((metadata): metadata is ScenarioSaveSlotMetadata => metadata !== null)
    .sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
}
