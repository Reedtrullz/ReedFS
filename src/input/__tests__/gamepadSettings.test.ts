import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GAMEPAD_SETTINGS,
  GAMEPAD_SETTINGS_STORAGE_KEY,
  loadGamepadSettings,
  sanitizeGamepadSettings,
  saveGamepadSettings,
  type GamepadSettingsState,
} from '../gamepadSettings';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe('gamepadSettings', () => {
  let storage: Storage;
  beforeEach(() => { storage = memoryStorage(); });

  it('returns defaults when storage is empty', () => {
    expect(loadGamepadSettings(storage)).toEqual(DEFAULT_GAMEPAD_SETTINGS);
  });

  it('round-trips sanitized settings', () => {
    const next: GamepadSettingsState = sanitizeGamepadSettings({
      version: 1,
      axisDeadzone: 0.2,
      triggerDeadzone: 0.1,
      invertElevator: true,
      invertAileron: false,
      invertRudder: true,
    });
    saveGamepadSettings(next, storage);
    expect(loadGamepadSettings(storage)).toEqual(next);
  });

  it('rejects malformed payloads and clamps out-of-range values', () => {
    storage.setItem(GAMEPAD_SETTINGS_STORAGE_KEY, '{not json');
    expect(loadGamepadSettings(storage)).toEqual(DEFAULT_GAMEPAD_SETTINGS);
    storage.setItem(GAMEPAD_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, axisDeadzone: 9, triggerDeadzone: 'x', invertElevator: true }));
    expect(loadGamepadSettings(storage)).toEqual(DEFAULT_GAMEPAD_SETTINGS);
    expect(sanitizeGamepadSettings({ ...DEFAULT_GAMEPAD_SETTINGS, axisDeadzone: 5 }).axisDeadzone).toBe(1);
    expect(sanitizeGamepadSettings({ ...DEFAULT_GAMEPAD_SETTINGS, axisDeadzone: -1 }).axisDeadzone).toBe(0);
  });

  it('keeps live defaults when storage throws', () => {
    const throwing: Storage = { ...storage, getItem: () => { throw new Error('blocked'); } };
    expect(loadGamepadSettings(throwing)).toEqual(DEFAULT_GAMEPAD_SETTINGS);
  });
});
