import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { InputManagerState } from '../input/InputManager';
import type { AircraftState, AutopilotCommands, ControlInputs } from '../sim/types';
import type { AutopilotControllerState } from '../sim/systems/autopilot';
import type { WindInfo } from '../sim/weather';
import type { ScenarioWeatherMetadata } from '../sim/weather';
import { SCENARIOS, scenarioById } from '../sim/scenarios';
import { B737_800_AIRCRAFT_DATA } from '../sim/data/aircraft/b737-800.v1';
import { B737_800_FDM_DATA_VERSION } from '../sim/data/aircraft/b737-800-fdm.v1';
import { isAircraftState, isAutopilotCommands, isAutopilotControllerState, isAutopilotState, isControlInputs, isFiniteSimulationData, isFlightPlan, isWeather, isWind } from '../sim/simulationValidation';
import type { SimStatus, SimStore } from './simStore';

export const SCENARIO_SAVE_KEY = 'rfs.scenarioSnapshot.v1';
export const DEFAULT_SCENARIO_SAVE_SLOT_ID = 'default';
const SCENARIO_SAVE_VERSION = 3;
const SCENARIO_SAVE_COLLECTION_VERSION = 3;
type ScenarioSaveVersion = 1 | 2 | typeof SCENARIO_SAVE_VERSION;
export const SCENARIO_SNAPSHOT_IDENTITIES = {
  aircraft: B737_800_AIRCRAFT_DATA.id,
  aircraftData: B737_800_AIRCRAFT_DATA.dataVersion,
  fdmData: B737_800_FDM_DATA_VERSION,
  sharedCommit: '810fc9652da431eaf8978b85bf4af131605559b5',
  clock: 'sim-time-ms/time-of-day-hours/v1',
} as const;

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
  weather?: ScenarioWeatherMetadata;
  identities?: typeof SCENARIO_SNAPSHOT_IDENTITIES;
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
  if (!isRecord(value) || !isFiniteSimulationData(value)) return false;
  const supportedVersion = value.version === 1 || value.version === 2 || value.version === SCENARIO_SAVE_VERSION;
  const validControllerState = value.version === 1
    ? (value.apControllerState === undefined || isAutopilotControllerState(value.apControllerState))
    : isAutopilotControllerState(value.apControllerState);
  const aircraft = isRecord(value.aircraft) && isRecord(value.aircraft.config) && value.version !== 3 && value.aircraft.config.gearPosition === undefined
    ? { ...value.aircraft, config: { ...value.aircraft.config, gearPosition: value.aircraft.config.gearDown === true ? 1 : 0 } }
    : value.aircraft;
  return (
    supportedVersion &&
    typeof value.savedAtIso === 'string' && Number.isFinite(Date.parse(value.savedAtIso)) &&
    SCENARIOS.some((scenario) => scenario.id === value.selectedScenarioId) &&
    ['stopped', 'running', 'paused'].includes(String(value.status)) &&
    isAircraftState(aircraft) &&
    isControlInputs(value.pilotInputs) &&
    isAutopilotCommands(value.apCommands) &&
    validControllerState &&
    isRecord(value.inputManager) &&
    ['elevator', 'aileron', 'rudder'].every((key) => typeof (value.inputManager as Record<string, unknown>)[key] === 'number' && Math.abs(Number((value.inputManager as Record<string, unknown>)[key])) <= 1) &&
    ['throttle', 'brake', 'leftBrake', 'rightBrake'].every((key) => typeof (value.inputManager as Record<string, unknown>)[key] === 'number' && Number((value.inputManager as Record<string, unknown>)[key]) >= 0 && Number((value.inputManager as Record<string, unknown>)[key]) <= 1) &&
    typeof value.inputManager.stabilizerTrimUnits === 'number' && value.inputManager.stabilizerTrimUnits >= 0 && value.inputManager.stabilizerTrimUnits <= 15 &&
    isAutopilotState(value.apState) && isFlightPlan(value.flightPlan) &&
    (value.activeLegIndex === null || (typeof value.activeLegIndex === 'number' && Number.isSafeInteger(value.activeLegIndex) && value.activeLegIndex >= 0 && value.flightPlan !== null && value.activeLegIndex < value.flightPlan.waypoints.length)) &&
    isWind(value.wind) &&
    (value.version !== 3 || (isWeather(value.weather) && isRecord(value.identities) && Object.entries(SCENARIO_SNAPSHOT_IDENTITIES).every(([key, expected]) => (value.identities as Record<string, unknown>)[key] === expected))) &&
    (value.weather === undefined || isWeather(value.weather)) &&
    typeof value.simulationTimeSeconds === 'number' && value.simulationTimeSeconds >= 0
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
    typeof value.simulationTimeSeconds === 'number' && Number.isFinite(value.simulationTimeSeconds) && value.simulationTimeSeconds >= 0 &&
    ['running', 'paused', 'stopped'].includes(String(value.status)) &&
    ['paused', 'stopped'].includes(String(value.restoreStatus))
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
  const id = options?.slotId?.trim() || scenarioSaveSlotIdFromName(slotNameFromOptions(options));
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) throw new Error('Invalid save slot identity');
  return id;
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

function migrateLegacySnapshot(snapshot: ScenarioSnapshot): ScenarioSaveCollection {
  const collection = collectionWithSlot(snapshot, {
    slotId: DEFAULT_SCENARIO_SAVE_SLOT_ID,
    slotName: 'Default save',
    overwrite: true,
  });
  return collection;
}

function parseStoredSave(storage: ScenarioPersistenceStorage):
  | { ok: true; collection: ScenarioSaveCollection }
  | { ok: false; reason: string; empty?: true } {
  let raw: string | null;
  try { raw = storage.getItem(SCENARIO_SAVE_KEY); }
  catch (error) { return { ok: false, reason: `storage read failed: ${error instanceof Error ? error.message : 'access denied'}` }; }
  if (raw === null) return { ok: false, reason: 'no saved scenario state found', empty: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid saved scenario JSON' };
  }

  if (isSaveCollection(parsed)) return { ok: true, collection: parsed };
  if (isValidSnapshot(parsed)) return { ok: true, collection: migrateLegacySnapshot(parsed) };
  return { ok: false, reason: 'saved scenario has an unsupported shape or version' };
}

function emptyCollection(): ScenarioSaveCollection {
  return { version: SCENARIO_SAVE_COLLECTION_VERSION, slots: {} };
}

function collectionForWrite(storage: ScenarioPersistenceStorage): ScenarioSaveCollection {
  const parsed = parseStoredSave(storage);
  if (!parsed.ok) {
    if (parsed.empty) return emptyCollection();
    throw new Error(`${parsed.reason}; previous save data preserved`);
  }
  if (Object.keys(parsed.collection.slots).some((id) => !slotFromCollection(parsed.collection, id).ok)) throw new Error('Existing collection contains an invalid slot; previous save data preserved');
  return structuredClone(parsed.collection);
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
  if (metadata.id !== slotId || metadata.selectedScenarioId !== rawSlot.snapshot.selectedScenarioId || metadata.savedAtIso !== rawSlot.snapshot.savedAtIso || metadata.status !== rawSlot.snapshot.status || metadata.restoreStatus !== restoreStatusFor(rawSlot.snapshot)) return { ok: false, reason: 'saved slot metadata disagrees with snapshot' };
  return { ok: true, snapshot: rawSlot.snapshot, metadata };
}

/** Read-only capture of store-owned immutable objects; clone before external use. */
export function captureScenarioSnapshot(state: SimStore): ScenarioSnapshot {
  return {
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
    weather: state.weather ?? scenarioById(state.selectedScenarioId).weather,
    identities: SCENARIO_SNAPSHOT_IDENTITIES,
    simulationTimeSeconds: state.simulationTimeSeconds,
  };
}

export function createScenarioSnapshot(state: SimStore): ScenarioSnapshot {
  return structuredClone(captureScenarioSnapshot(state));
}

export function saveScenarioSnapshot(
  storage: ScenarioPersistenceStorage,
  snapshot: ScenarioSnapshot,
  options?: ScenarioSaveOptions,
): ScenarioSaveSlotMetadata {
  if (!isValidSnapshot(snapshot)) throw new Error('Invalid scenario snapshot; save refused');
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
