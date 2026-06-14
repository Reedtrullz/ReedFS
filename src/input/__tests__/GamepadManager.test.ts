import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAMEPAD_CALIBRATION, __resetGamepadStateForTests, readGamepad, readGamepadActions } from '../GamepadManager';

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

describe('readGamepad', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGetGamepadsDescriptor) {
      Object.defineProperty(navigator, 'getGamepads', originalGetGamepadsDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'getGamepads');
    }
    __resetGamepadStateForTests();
  });

  it('returns null when Gamepad API is missing', () => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: undefined,
    });

    let result: ReturnType<typeof readGamepad> | undefined;
    expect(() => {
      result = readGamepad();
    }).not.toThrow();
    expect(result).toBeNull();
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

  it('does not emit a clear payload after active inputs return to neutral', () => {
    setGamepads([
      {
        axes: [0.2, -0.3, 0.4],
        buttons: Array.from({ length: 8 }, (_, i) => button(i === 7 ? 0.6 : 0)),
      },
    ]);

    const active = readGamepad();
    expect(active).not.toBeNull();
    expect(active?.elevator).toBeCloseTo(-0.21, 8);
    expect(active?.aileron).toBeCloseTo(0.14, 8);
    expect(active?.rudder).toBeCloseTo(0.2, 8);
    expect(active?.throttle1).toBeCloseTo(0.8, 8);
    expect(active?.throttle2).toBeCloseTo(0.8, 8);

    setGamepads([
      {
        axes: [0, 0, 0],
        buttons: Array.from({ length: 8 }, () => button(0)),
      },
    ]);

    expect(readGamepad()).toBeNull();

    expect(readGamepad()).toBeNull();
  });

  it('uses the first non-null gamepad slot', () => {
    setGamepads([
      null,
      {
        axes: [0.25, 0, 0],
        buttons: Array.from({ length: 8 }, () => button(0)),
      },
    ]);

    const result = readGamepad();
    expect(result).toEqual({ aileron: expect.any(Number) });
    expect(result?.aileron).toBeCloseTo(0.175, 8);
  });

  it('returns only fields that are currently active while other controls become neutral', () => {
    setGamepads([
      {
        axes: [0.25, 0, 0],
        buttons: Array.from({ length: 8 }, () => button(0)),
      },
    ]);

    const first = readGamepad();
    expect(first?.aileron).toBeCloseTo(0.175, 8);

    setGamepads([
      {
        axes: [0, 0, 0.4],
        buttons: Array.from({ length: 8 }, () => button(0)),
      },
    ]);

    const second = readGamepad();
    expect(second).toEqual({ rudder: 0.2 });
  });

  it('returns null for malformed partial gamepad object without throwing', () => {
    setGamepads([{}]);

    let result: ReturnType<typeof readGamepad> | undefined;
    expect(() => {
      result = readGamepad();
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('returns only active fields when sticks or triggers move beyond the deadzone', () => {
    setGamepads([
      {
        axes: [0.2, -0.3, 0.4],
        buttons: Array.from({ length: 8 }, (_, i) => button(i === 7 ? 0.6 : 0)),
      },
    ]);

    const result = readGamepad();
    expect(result).not.toBeNull();
    expect(result?.elevator).toBeCloseTo(-0.21, 8);
    expect(result?.aileron).toBeCloseTo(0.14, 8);
    expect(result?.rudder).toBeCloseTo(0.2, 8);
    expect(result?.throttle1).toBeCloseTo(0.8, 8);
    expect(result?.throttle2).toBeCloseTo(0.8, 8);
  });

  it('returns normalized action intent for the input manager', () => {
    setGamepads([
      {
        axes: [0.2, -0.3, 0.4],
        buttons: Array.from({ length: 8 }, (_, i) => button(i === 7 ? 0.6 : 0)),
      },
    ]);

    const result = readGamepadActions();

    expect(result).toEqual({
      pitch: -0.3,
      roll: 0.2,
      yaw: 0.4,
      throttleRate: 0.6,
    });
  });

  it('maps standard buttons to brake plus edge-triggered flaps and gear actions', () => {
    setGamepads([
      {
        axes: [0, 0, 0],
        buttons: Array.from({ length: 16 }, (_, i) => button(i === 0 || i === 4 || i === 5 ? 1 : 0)),
      },
    ]);

    expect(readGamepadActions()).toEqual({
      brake: 1,
      flapNext: true,
      gearToggle: true,
    });

    expect(readGamepadActions()).toEqual({ brake: 1 });

    setGamepads([
      {
        axes: [0, 0, 0],
        buttons: Array.from({ length: 16 }, () => button(0)),
      },
    ]);
    expect(readGamepadActions()).toBeNull();

    setGamepads([
      {
        axes: [0, 0, 0],
        buttons: Array.from({ length: 16 }, (_, i) => button(i === 4 || i === 5 ? 1 : 0)),
      },
    ]);
    expect(readGamepadActions()).toEqual({ flapNext: true, gearToggle: true });
  });

  it('applies calibration inversion to action intent', () => {
    setGamepads([
      {
        axes: [0, -0.3, 0],
        buttons: Array.from({ length: 8 }, () => button(0)),
      },
    ]);

    const result = readGamepadActions({ ...DEFAULT_GAMEPAD_CALIBRATION, invertElevator: true });

    expect(result).toEqual({ pitch: 0.3 });
  });

  it('emits edge-triggered full-loop gamepad commands without repeating held toggles', () => {
    setGamepads([
      {
        axes: [0, 0, 0],
        buttons: Array.from({ length: 16 }, (_, i) => button([0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 14, 15].includes(i) ? 1 : 0)),
      },
    ]);

    const first = readGamepadActions() as ReturnType<typeof readGamepadActions> & { commands?: string[] };
    expect(first).toEqual({
      brake: 1,
      flapNext: true,
      gearToggle: true,
      commands: [
        'camera',
        'overlay',
        'audio',
        'reset',
        'startPause',
        'mcpFdLeft',
        'mcpHdgSel',
        'mcpAltHold',
        'mcpSpeed',
      ],
    });

    const held = readGamepadActions() as ReturnType<typeof readGamepadActions> & { commands?: string[] };
    expect(held).toEqual({ brake: 1 });
  });
});
