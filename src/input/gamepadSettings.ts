import { DEFAULT_GAMEPAD_CALIBRATION, type GamepadCalibration } from './GamepadManager';

export const GAMEPAD_SETTINGS_STORAGE_KEY = 'rfs.gamepadSettings.v1';

export type GamepadSettingsState = GamepadCalibration & { version: 1 };

export const DEFAULT_GAMEPAD_SETTINGS: GamepadSettingsState = {
  version: 1,
  ...DEFAULT_GAMEPAD_CALIBRATION,
};

export interface GamepadSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): GamepadSettingsStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function clampUnit(value: unknown): number {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, v));
}

function isGamepadSettings(value: unknown): value is GamepadSettingsState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GamepadSettingsState>;
  return candidate.version === 1
    && typeof candidate.axisDeadzone === 'number' && Number.isFinite(candidate.axisDeadzone)
    && typeof candidate.triggerDeadzone === 'number' && Number.isFinite(candidate.triggerDeadzone)
    && typeof candidate.invertElevator === 'boolean'
    && typeof candidate.invertAileron === 'boolean'
    && typeof candidate.invertRudder === 'boolean';
}

export function sanitizeGamepadSettings(settings: GamepadSettingsState): GamepadSettingsState {
  return {
    version: 1,
    axisDeadzone: clampUnit(settings.axisDeadzone),
    triggerDeadzone: clampUnit(settings.triggerDeadzone),
    invertElevator: Boolean(settings.invertElevator),
    invertAileron: Boolean(settings.invertAileron),
    invertRudder: Boolean(settings.invertRudder),
  };
}

export function loadGamepadSettings(storage: GamepadSettingsStorage | undefined = browserStorage()): GamepadSettingsState {
  if (!storage) return DEFAULT_GAMEPAD_SETTINGS;
  try {
    const raw = storage.getItem(GAMEPAD_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_GAMEPAD_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!isGamepadSettings(parsed)) return DEFAULT_GAMEPAD_SETTINGS;
    return sanitizeGamepadSettings(parsed);
  } catch {
    return DEFAULT_GAMEPAD_SETTINGS;
  }
}

export function saveGamepadSettings(settings: GamepadSettingsState, storage: GamepadSettingsStorage | undefined = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(GAMEPAD_SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeGamepadSettings(settings)));
  } catch {
    // localStorage may be unavailable or full; keep the live in-memory setting.
  }
}
