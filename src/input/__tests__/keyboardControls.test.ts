import { describe, expect, it } from 'vitest';
import type { ControlInputs } from '../../sim/types';
import {
  applyDiscreteKeyAction,
  applyDiscreteKeyInput,
  computeHeldKeyActions,
  computeHeldKeyInputs,
  shouldIgnoreKeyboardEvent,
} from '../keyboardControls';
import { B737_FLAP_DETENTS, nextB737FlapDetent } from '../flapDetents';

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
      leftBrake: 0,
      rightBrake: 0,
    });
  });

  it('maps Z to the left-brake action only', () => {
    expect(computeHeldKeyActions(new Set(['z']))).toEqual({ leftBrake: 1 });
  });

  it('maps X to the right-brake action only', () => {
    expect(computeHeldKeyActions(new Set(['x']))).toEqual({ rightBrake: 1 });
  });

  it('keeps Space mapped to symmetric brake action', () => {
    expect(computeHeldKeyActions(new Set([' ']))).toEqual({ brake: 1 });
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

  it('dispatches flap and gear keys as shared input actions', () => {
    expect(applyDiscreteKeyAction('f')).toEqual({ flapNext: true });
    expect(applyDiscreteKeyAction('g')).toEqual({ gearToggle: true });
  });

  it('uses the shared B737 flap detent sequence for keyboard flap cycling', () => {
    expect(B737_FLAP_DETENTS).toEqual([0, 1, 2, 5, 10, 15, 25, 30, 40]);
    expect(B737_FLAP_DETENTS.map(nextB737FlapDetent)).toEqual([1, 2, 5, 10, 15, 25, 30, 40, 0]);

    expect(applyDiscreteKeyInput('g', inputs)).toEqual({ gearLever: 'UP' });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 0 })).toEqual({ flapLever: 1 });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 1 })).toEqual({ flapLever: 2 });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 2 })).toEqual({ flapLever: 5 });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 15 })).toEqual({ flapLever: 25 });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 40 })).toEqual({ flapLever: 0 });
  });

  it('normalizes out-of-detent flap values to the next B737 detent', () => {
    expect(nextB737FlapDetent(-1)).toBe(0);
    expect(nextB737FlapDetent(3)).toBe(5);
    expect(nextB737FlapDetent(5.1)).toBe(10);
    expect(nextB737FlapDetent(40.1)).toBe(0);
    expect(nextB737FlapDetent(Number.NaN)).toBe(0);
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
