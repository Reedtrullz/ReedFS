export interface EngineSoundParams {
  fanFrequencyHz: number;
  coreFrequencyHz: number;
  fanGain: number;
  coreGain: number;
  noiseGain: number;
}

export interface GpwsSpeechParams {
  text: string;
  rate: number;
  pitch: number;
  volume: number;
}

const ENGINE_FAN_IDLE_FREQUENCY_HZ = 90;
const ENGINE_FAN_MAX_FREQUENCY_HZ = 320;
const ENGINE_CORE_IDLE_FREQUENCY_HZ = 240;
const ENGINE_CORE_MAX_FREQUENCY_HZ = 840;
const ENGINE_FAN_MAX_GAIN = 0.04;
const ENGINE_CORE_MAX_GAIN = 0.03;

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
    fanFrequencyHz: roundAudioParam(
      ENGINE_FAN_IDLE_FREQUENCY_HZ + (ENGINE_FAN_MAX_FREQUENCY_HZ - ENGINE_FAN_IDLE_FREQUENCY_HZ) * normalizedN1,
    ),
    coreFrequencyHz: roundAudioParam(
      ENGINE_CORE_IDLE_FREQUENCY_HZ + (ENGINE_CORE_MAX_FREQUENCY_HZ - ENGINE_CORE_IDLE_FREQUENCY_HZ) * normalizedN1,
    ),
    fanGain: roundAudioParam(ENGINE_FAN_MAX_GAIN * normalizedN1),
    coreGain: roundAudioParam(ENGINE_CORE_MAX_GAIN * normalizedN1),
    noiseGain: roundAudioParam(0.0325 * normalizedN1 + 0.0225 * normalizedN1 * normalizedN1),
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
