import { describe, expect, it } from 'vitest';
import {
  clampAudioUnit,
  mapEngineN1ToSoundParams,
  mapGpwsCalloutToSpeechParams,
} from '../audioMapping';

describe('audio mapping', () => {
  it('clamps unit audio values into the Web Audio gain range', () => {
    expect(clampAudioUnit(-0.5)).toBe(0);
    expect(clampAudioUnit(0.42)).toBe(0.42);
    expect(clampAudioUnit(1.7)).toBe(1);
  });

  it('maps engine N1 to layered turbine/airflow parameters instead of a low-frequency hum', () => {
    expect(mapEngineN1ToSoundParams(0)).toEqual({
      fanFrequencyHz: 90,
      coreFrequencyHz: 240,
      fanGain: 0,
      coreGain: 0,
      noiseGain: 0,
    });
    expect(mapEngineN1ToSoundParams(50)).toEqual({
      fanFrequencyHz: 205,
      coreFrequencyHz: 540,
      fanGain: 0.02,
      coreGain: 0.015,
      noiseGain: 0.021875,
    });
    expect(mapEngineN1ToSoundParams(100)).toEqual({
      fanFrequencyHz: 320,
      coreFrequencyHz: 840,
      fanGain: 0.04,
      coreGain: 0.03,
      noiseGain: 0.055,
    });
  });

  it('clamps engine N1 before mapping sound parameters', () => {
    expect(mapEngineN1ToSoundParams(-20)).toEqual({
      fanFrequencyHz: 90,
      coreFrequencyHz: 240,
      fanGain: 0,
      coreGain: 0,
      noiseGain: 0,
    });
    expect(mapEngineN1ToSoundParams(140)).toEqual({
      fanFrequencyHz: 320,
      coreFrequencyHz: 840,
      fanGain: 0.04,
      coreGain: 0.03,
      noiseGain: 0.055,
    });
  });

  it('maps GPWS callout text to stable speech synthesis parameters', () => {
    expect(mapGpwsCalloutToSpeechParams('PULL UP')).toEqual({
      text: 'PULL UP',
      rate: 0.8,
      pitch: 0.9,
      volume: 0.7,
    });
  });
});
