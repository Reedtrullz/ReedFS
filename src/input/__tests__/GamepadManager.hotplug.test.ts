import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAMEPAD_CALIBRATION, __resetGamepadStateForTests, readGamepadActions } from '../GamepadManager';

const originalGetGamepadsDescriptor = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');

function button(value: number): GamepadButton {
  return { pressed: value > 0, touched: value > 0, value };
}

function setGamepads(gamepads: Array<Partial<Gamepad> | null>): void {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: vi.fn(() => gamepads as Gamepad[]),
  });
}

function padWithButton(pressedIndex: number): Partial<Gamepad> {
  return {
    axes: [0, 0, 0],
    buttons: Array.from({ length: 16 }, (_, i) => button(i === pressedIndex ? 1 : 0)),
  };
}

describe('gamepad hot-plug', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGetGamepadsDescriptor) {
      Object.defineProperty(navigator, 'getGamepads', originalGetGamepadsDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'getGamepads');
    }
    __resetGamepadStateForTests();
  });

  it('does not carry pressed-button memory from a disconnected pad to the next pad', () => {
    setGamepads([padWithButton(2)]);
    expect(readGamepadActions(DEFAULT_GAMEPAD_CALIBRATION)?.commands).toContain('camera');

    setGamepads([null]);
    expect(readGamepadActions(DEFAULT_GAMEPAD_CALIBRATION)).toBeNull();

    setGamepads([padWithButton(2)]);
    expect(readGamepadActions(DEFAULT_GAMEPAD_CALIBRATION)?.commands).toContain('camera');
  });
});
