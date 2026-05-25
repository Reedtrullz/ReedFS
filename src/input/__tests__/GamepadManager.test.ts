import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGamepad } from '../GamepadManager';

function button(value: number): GamepadButton {
  return { pressed: value > 0, touched: value > 0, value };
}

function setGamepads(gamepads: Array<Partial<Gamepad> | null>): void {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: vi.fn(() => gamepads as Gamepad[]),
  });
}

describe('readGamepad', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when there is no gamepad', () => {
    setGamepads([]);

    expect(readGamepad()).toBeNull();
  });

  it('returns null for a neutral gamepad so keyboard input is not overwritten', () => {
    setGamepads([
      {
        axes: [0, 0, 0],
        buttons: Array.from({ length: 8 }, () => button(0)),
      },
    ]);

    expect(readGamepad()).toBeNull();
  });

  it('returns only active fields when sticks or triggers move beyond the deadzone', () => {
    setGamepads([
      {
        axes: [0.2, -0.3, 0.4],
        buttons: Array.from({ length: 8 }, (_, i) => button(i === 7 ? 0.6 : 0)),
      },
    ]);

    expect(readGamepad()).toEqual({
      elevator: -0.21,
      aileron: 0.13999999999999999,
      rudder: 0.2,
      throttle1: 0.8,
      throttle2: 0.8,
    });
  });
});
