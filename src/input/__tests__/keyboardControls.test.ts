import { describe, expect, it } from 'vitest';
import type { ControlInputs } from '../../sim/types';
import { applyDiscreteKeyInput, computeHeldKeyInputs, shouldIgnoreKeyboardEvent } from '../keyboardControls';

const inputs: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0.5,
  throttle2: 0.5,
  flapLever: 0,
  gearLever: 'DOWN',
  spoilers: 0,
  brake: 0,
};

function keyboardEventForTarget(key: string, target: HTMLElement, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('keyboardControls', () => {
  it('computes simultaneous pitch roll and rudder axes from held keys', () => {
    const keys = new Set(['w', 'd', 'q', ' ']);

    expect(computeHeldKeyInputs(keys)).toEqual({
      elevator: -1,
      aileron: 0.5,
      rudder: -0.5,
      brake: 1,
    });
  });

  it('increments throttle instead of jumping straight to full power', () => {
    expect(applyDiscreteKeyInput('arrowup', inputs)).toEqual({
      throttle1: 0.55,
      throttle2: 0.55,
    });
  });

  it('clamps throttle at full power when incrementing near max', () => {
    expect(applyDiscreteKeyInput('arrowup', { ...inputs, throttle1: 0.98, throttle2: 0.98 })).toEqual({
      throttle1: 1,
      throttle2: 1,
    });
  });

  it('decrements throttle without going below idle', () => {
    expect(applyDiscreteKeyInput('arrowdown', { ...inputs, throttle1: 0.02, throttle2: 0.02 })).toEqual({
      throttle1: 0,
      throttle2: 0,
    });
  });

  it('toggles gear and cycles flaps', () => {
    expect(applyDiscreteKeyInput('g', inputs)).toEqual({ gearLever: 'UP' });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 0 })).toEqual({ flapLever: 5 });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 5 })).toEqual({ flapLever: 10 });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 40 })).toEqual({ flapLever: 0 });
  });

  it('ignores editable targets and browser shortcut modifiers', () => {
    expect(shouldIgnoreKeyboardEvent(keyboardEventForTarget('w', document.createElement('input')))).toBe(true);
    expect(shouldIgnoreKeyboardEvent(keyboardEventForTarget('f', document.body, { ctrlKey: true }))).toBe(true);
    expect(shouldIgnoreKeyboardEvent(keyboardEventForTarget('f', document.body, { metaKey: true }))).toBe(true);
  });

  it('allows flight keys on focused buttons except native activation keys', () => {
    const button = document.createElement('button');

    expect(shouldIgnoreKeyboardEvent(keyboardEventForTarget('w', button))).toBe(false);
    expect(shouldIgnoreKeyboardEvent(keyboardEventForTarget(' ', button))).toBe(true);
    expect(shouldIgnoreKeyboardEvent(keyboardEventForTarget('Enter', button))).toBe(true);
  });
});
