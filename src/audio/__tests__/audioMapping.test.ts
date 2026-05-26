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

  it('maps engine N1 to deterministic oscillator frequency and gain', () => {
    expect(mapEngineN1ToSoundParams(0)).toEqual({ frequencyHz: 40, gain: 0 });
    expect(mapEngineN1ToSoundParams(50)).toEqual({ frequencyHz: 110, gain: 0.06 });
    expect(mapEngineN1ToSoundParams(100)).toEqual({ frequencyHz: 180, gain: 0.12 });
  });

  it('clamps engine N1 before mapping sound parameters', () => {
    expect(mapEngineN1ToSoundParams(-20)).toEqual({ frequencyHz: 40, gain: 0 });
    expect(mapEngineN1ToSoundParams(140)).toEqual({ frequencyHz: 180, gain: 0.12 });
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
