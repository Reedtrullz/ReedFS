import { describe, expect, it } from 'vitest';
import {
  createInputManagerState,
  inputManagerStateToControlInputs,
  mergeInputActions,
  updateInputManager,
} from '../InputManager';

describe('InputManager', () => {
  it('ramps elevator over time while pitch-up command is held', () => {
    const state = createInputManagerState();

    const firstFrame = updateInputManager(state, { pitch: -1 }, 0.2);
    expect(firstFrame.elevator).toBeCloseTo(-0.3, 8);
    expect(firstFrame.elevator).toBeGreaterThan(-1);

    let held = firstFrame;
    for (let i = 0; i < 10; i += 1) {
      held = updateInputManager(held, { pitch: -1 }, 0.1);
    }

    expect(held.elevator).toBe(-1);
  });

  it('recenters elevator over time after pitch command is released', () => {
    const deflected = createInputManagerState({ elevator: -0.8 });

    const returning = updateInputManager(deflected, {}, 0.2);
    expect(returning.elevator).toBeCloseTo(-0.4, 8);
    expect(returning.elevator).toBeGreaterThan(deflected.elevator);
    expect(returning.elevator).toBeLessThan(0);

    const centered = updateInputManager(returning, {}, 0.3);
    expect(centered.elevator).toBe(0);
  });

  it('latches throttle changes instead of erasing them when later actions are neutral', () => {
    const state = createInputManagerState({ throttle: 0.5 });

    const stepped = updateInputManager(state, { throttleDelta: 0.05 }, 1 / 60);
    expect(stepped.throttle).toBeCloseTo(0.55, 8);

    const afterNeutralGamepad = updateInputManager(stepped, {}, 1);
    expect(afterNeutralGamepad.throttle).toBeCloseTo(0.55, 8);
    expect(inputManagerStateToControlInputs(afterNeutralGamepad)).toEqual(
      expect.objectContaining({ throttle1: 0.55, throttle2: 0.55 }),
    );
  });

  it('keeps keyboard intent when merged with a neutral gamepad intent', () => {
    const actions = mergeInputActions({ pitch: -1 }, {});

    const state = updateInputManager(createInputManagerState(), actions, 0.2);

    expect(state.elevator).toBeLessThan(0);
    expect(state.elevator).toBeCloseTo(-0.3, 8);
  });
});
