import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGPWS, updateGPWS } from '../GPWS';
import { B737_800_SPEC, createInitialState } from '../../sim/types';

class Utterance {
  text: string; rate = 1; pitch = 1; volume = 1;
  onend: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(text: string) { this.text = text; }
}
const spoken: Utterance[] = [];
const speak = vi.fn((utterance: Utterance) => { spoken.push(utterance); });
const cancel = vi.fn();
function alertState(urgent = false) {
  const state = createInitialState(B737_800_SPEC);
  state.ground.aglFt = 180; state.ground.weightOnWheels = false;
  state.velocity = { u: 90, v: 0, w: urgent ? 16 : 0 };
  state.config.gearDown = false; state.flightPhase = 'APPROACH';
  return state;
}
beforeEach(() => { resetGPWS(); spoken.length = 0; speak.mockClear(); cancel.mockClear(); vi.stubGlobal('speechSynthesis', { speak, cancel }); vi.stubGlobal('SpeechSynthesisUtterance', Utterance); });
afterEach(() => { resetGPWS(); vi.unstubAllGlobals(); });

describe('warning delivery', () => {
  it('preempts a weaker warning without waiting for its cooldown', () => {
    const onCaption = vi.fn();
    updateGPWS(alertState(), { nowMs: 4000, onCaption });
    updateGPWS(alertState(true), { nowMs: 4010, onCaption });
    expect(spoken.map((item) => item.text)).toEqual(['TOO LOW GEAR', 'PULL UP']);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onCaption).toHaveBeenCalledTimes(2);
  });
  it('keeps one active utterance rather than building a stale repeat backlog', () => {
    const onCaption = vi.fn();
    for (const nowMs of [4000, 7500, 11000]) updateGPWS(alertState(true), { nowMs, onCaption });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(onCaption).toHaveBeenCalledTimes(3);
  });
  it('master zero cancels active speech and still permits captions', () => {
    const onCaption = vi.fn();
    updateGPWS(alertState(true), { nowMs: 4000, masterVolume: 0.5 });
    updateGPWS(alertState(true), { nowMs: 7500, masterVolume: 0, onCaption });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(onCaption).toHaveBeenCalledWith(expect.objectContaining({ text: 'PULL UP' }));
  });
  it('scales speech by the validated master level', () => {
    updateGPWS(alertState(true), { nowMs: 4000, masterVolume: 0.2 });
    expect(spoken[0].volume).toBeCloseTo(0.14);
  });
  it('reset cancels speech and ignores obsolete end callbacks', () => {
    updateGPWS(alertState(), { nowMs: 4000 });
    const obsolete = spoken[0];
    resetGPWS();
    updateGPWS(alertState(true), { nowMs: 4010 });
    obsolete.onend?.();
    updateGPWS(alertState(true), { nowMs: 7500 });
    expect(spoken.map((item) => item.text)).toEqual(['TOO LOW GEAR', 'PULL UP']);
  });
  it('speech rejection cannot prevent caption-only warning access', () => {
    speak.mockImplementationOnce(() => { throw new Error('voice rejected'); });
    const onCaption = vi.fn();
    expect(() => updateGPWS(alertState(true), { nowMs: 4000, onCaption })).not.toThrow();
    expect(onCaption).toHaveBeenCalledTimes(1);
  });
});

it.each([false, true])('preserves identity cooldown through A to B to A (volume change=%s)', (volumeChange) => {
  const onCaption = vi.fn();
  updateGPWS(alertState(), { nowMs: 4000, masterVolume: 0.5, onCaption });
  updateGPWS(alertState(true), { nowMs: 4010, masterVolume: volumeChange ? 0.8 : 0.5, onCaption });
  updateGPWS(alertState(), { nowMs: 4020, masterVolume: volumeChange ? 0.8 : 0.5, onCaption });
  expect(spoken.map((item) => item.text)).toEqual(['TOO LOW GEAR', 'PULL UP']);
  // Captions still track the current condition even if speech is cooling down.
  expect(onCaption).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'TOO LOW GEAR', timestampMs: 4020, delivery: 'caption' }));
});

it('keeps caption access when the browser has no speech API', () => {
  vi.stubGlobal('speechSynthesis', undefined);
  vi.stubGlobal('SpeechSynthesisUtterance', undefined);
  const onCaption = vi.fn();
  expect(() => updateGPWS(alertState(true), { nowMs: 20, onCaption })).not.toThrow();
  expect(onCaption).toHaveBeenCalledWith(expect.objectContaining({ text: 'PULL UP', delivery: 'caption' }));
});
it('does not label empty-voice caption access as audible delivery', () => {
  vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [] });
  const onCaption = vi.fn();
  updateGPWS(alertState(true), { nowMs: 20, onCaption });
  expect(onCaption).toHaveBeenCalledWith(expect.objectContaining({ text: 'PULL UP', delivery: 'caption' }));
});
