import { clampAudioUnit } from './audioMapping';

export const AUDIO_SETTINGS_STORAGE_KEY = 'rfs.audioSettings.v1';

export interface AudioSettingsState {
  version: 1;
  masterVolume: number;
  muted: boolean;
  captionsEnabled: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettingsState = {
  version: 1,
  masterVolume: 0.5,
  muted: false,
  captionsEnabled: true,
};

export interface AudioSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): AudioSettingsStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isAudioSettings(value: unknown): value is AudioSettingsState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AudioSettingsState>;
  return candidate.version === 1
    && typeof candidate.masterVolume === 'number'
    && Number.isFinite(candidate.masterVolume)
    && candidate.masterVolume >= 0
    && candidate.masterVolume <= 1
    && typeof candidate.muted === 'boolean'
    && typeof candidate.captionsEnabled === 'boolean';
}

export function sanitizeAudioSettings(settings: AudioSettingsState): AudioSettingsState {
  return {
    version: 1,
    masterVolume: clampAudioUnit(settings.masterVolume),
    muted: Boolean(settings.muted),
    captionsEnabled: Boolean(settings.captionsEnabled),
  };
}

export function effectiveMasterVolume(settings: AudioSettingsState): number {
  return settings.muted ? 0 : clampAudioUnit(settings.masterVolume);
}

export function loadAudioSettings(storage: AudioSettingsStorage | undefined = browserStorage()): AudioSettingsState {
  if (!storage) return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = storage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!isAudioSettings(parsed)) return DEFAULT_AUDIO_SETTINGS;
    return sanitizeAudioSettings(parsed);
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function saveAudioSettings(settings: AudioSettingsState, storage: AudioSettingsStorage | undefined = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeAudioSettings(settings)));
  } catch {
    // localStorage may be unavailable or full; keep the live in-memory setting.
  }
}
