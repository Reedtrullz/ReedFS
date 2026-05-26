export interface EngineSoundParams {
  frequencyHz: number;
  gain: number;
}

export interface GpwsSpeechParams {
  text: string;
  rate: number;
  pitch: number;
  volume: number;
}

const ENGINE_IDLE_FREQUENCY_HZ = 40;
const ENGINE_MAX_FREQUENCY_HZ = 180;
const ENGINE_MAX_GAIN = 0.12;

function roundAudioParam(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function clampAudioUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function mapEngineN1ToSoundParams(n1Percent: number): EngineSoundParams {
  const n1 = clampPercent(n1Percent);
  const normalizedN1 = n1 / 100;
  return {
    frequencyHz: roundAudioParam(
      ENGINE_IDLE_FREQUENCY_HZ + (ENGINE_MAX_FREQUENCY_HZ - ENGINE_IDLE_FREQUENCY_HZ) * normalizedN1,
    ),
    gain: roundAudioParam(ENGINE_MAX_GAIN * normalizedN1),
  };
}

export function mapGpwsCalloutToSpeechParams(text: string): GpwsSpeechParams {
  return {
    text,
    rate: 0.8,
    pitch: 0.9,
    volume: 0.7,
  };
}
