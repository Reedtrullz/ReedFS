import type { ControlInputs } from '../sim/types';

const AXIS_DEADZONE = 0.08;
const TRIGGER_DEADZONE = 0.05;

type GamepadControlField = 'elevator' | 'aileron' | 'rudder' | 'throttle1' | 'throttle2';

let previouslyEmittedFields = new Set<GamepadControlField>();

function activeAxis(value: number | undefined): number {
  const v = value ?? 0;
  return Math.abs(v) < AXIS_DEADZONE ? 0 : v;
}

function activeTrigger(value: number | undefined): number {
  const v = value ?? 0;
  return v < TRIGGER_DEADZONE ? 0 : Math.max(0, Math.min(1, v));
}

function clearPreviouslyEmittedFields(): Partial<ControlInputs> | null {
  if (previouslyEmittedFields.size === 0) return null;

  const cleared: Partial<ControlInputs> = {};
  for (const field of previouslyEmittedFields) {
    cleared[field] = 0;
  }

  previouslyEmittedFields.clear();
  return cleared;
}

export function __resetGamepadStateForTests(): void {
  previouslyEmittedFields.clear();
}

export function readGamepad(): Partial<ControlInputs> | null {
  const nav = typeof globalThis.navigator === 'undefined' ? undefined : globalThis.navigator;
  if (!nav || typeof nav.getGamepads !== 'function') return clearPreviouslyEmittedFields();

  const gamepads = nav.getGamepads();
  if (!gamepads) return clearPreviouslyEmittedFields();

  const gp = Array.from(gamepads).find((pad): pad is Gamepad => pad != null);
  if (!gp) return clearPreviouslyEmittedFields();

  const leftX = activeAxis(gp.axes?.[0]);
  const leftY = activeAxis(gp.axes?.[1]);
  const rightX = activeAxis(gp.axes?.[2]);
  const rightTrigger = activeTrigger(gp.buttons?.[7]?.value);
  const leftTrigger = activeTrigger(gp.buttons?.[6]?.value);

  const inputs: Partial<ControlInputs> = {};

  if (leftY !== 0) inputs.elevator = leftY * 0.7;
  if (leftX !== 0) inputs.aileron = leftX * 0.7;
  if (rightX !== 0) inputs.rudder = rightX * 0.5;

  if (rightTrigger > 0 || leftTrigger > 0) {
    const throttle1 = Math.max(0, Math.min(1, 0.5 + rightTrigger * 0.5 - leftTrigger * 0.5));
    inputs.throttle1 = throttle1;
    inputs.throttle2 = throttle1;
  }

  const fields = Object.keys(inputs) as GamepadControlField[];
  if (fields.length > 0) {
    previouslyEmittedFields = new Set(fields);
    return inputs;
  }

  return clearPreviouslyEmittedFields();
}
