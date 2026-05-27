import type { ControlInputs } from '../sim/types';
import type { InputActions } from './InputManager';

export const THROTTLE_STEP = 0.05;
export const TRIM_STEP_UNITS = 0.1;
const ELEVATOR_KEY_DEFLECTION = 1;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nextFlapDetent(flaps: number): number {
  return flaps >= 40 ? 0 : flaps < 5 ? 5 : flaps + 5;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const element = target as HTMLElement;
  return Boolean(
    element.isContentEditable ||
      element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'),
  );
}

function isNativeActivationKey(key: string): boolean {
  return key === ' ' || key.toLowerCase() === 'enter';
}

function isInteractiveActivationTarget(target: EventTarget | null, key: string): boolean {
  if (!isNativeActivationKey(key) || !target || typeof (target as Element).closest !== 'function') return false;
  const element = target as HTMLElement;
  return Boolean(element.closest('button, a[href], [role="button"], summary'));
}

export function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  return Boolean(
    event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isEditableKeyboardTarget(event.target) ||
      isInteractiveActivationTarget(event.target, event.key),
  );
}

export function computeHeldKeyInputs(keys: ReadonlySet<string>): Partial<ControlInputs> {
  return {
    elevator: (keys.has('w') ? -ELEVATOR_KEY_DEFLECTION : 0) + (keys.has('s') ? ELEVATOR_KEY_DEFLECTION : 0),
    aileron: (keys.has('a') ? -0.5 : 0) + (keys.has('d') ? 0.5 : 0),
    rudder: (keys.has('q') ? -0.5 : 0) + (keys.has('e') ? 0.5 : 0),
    brake: keys.has(' ') ? 1 : 0,
    leftBrake: keys.has('z') ? 1 : 0,
    rightBrake: keys.has('x') ? 1 : 0,
  };
}

export function computeHeldKeyActions(keys: ReadonlySet<string>): InputActions {
  const heldInputs = computeHeldKeyInputs(keys);
  const actions: InputActions = {};
  if (heldInputs.elevator !== undefined && heldInputs.elevator !== 0) actions.pitch = heldInputs.elevator;
  if (heldInputs.aileron !== undefined && heldInputs.aileron !== 0) actions.roll = heldInputs.aileron;
  if (heldInputs.rudder !== undefined && heldInputs.rudder !== 0) actions.yaw = heldInputs.rudder;
  if (heldInputs.brake !== undefined && heldInputs.brake !== 0) actions.brake = heldInputs.brake;
  if (heldInputs.leftBrake !== undefined && heldInputs.leftBrake !== 0) actions.leftBrake = heldInputs.leftBrake;
  if (heldInputs.rightBrake !== undefined && heldInputs.rightBrake !== 0) actions.rightBrake = heldInputs.rightBrake;
  return actions;
}

export function applyDiscreteKeyAction(key: string): InputActions | null {
  switch (key.toLowerCase()) {
    case 'arrowup':
      return { throttleDelta: THROTTLE_STEP };
    case 'arrowdown':
      return { throttleDelta: -THROTTLE_STEP };
    case ']':
      return { trimDelta: TRIM_STEP_UNITS };
    case '[':
      return { trimDelta: -TRIM_STEP_UNITS };
    default:
      return null;
  }
}

export function applyDiscreteKeyInput(key: string, inputs: ControlInputs): Partial<ControlInputs> | null {
  switch (key.toLowerCase()) {
    case 'arrowup': {
      const throttle = clamp01(Math.max(inputs.throttle1, inputs.throttle2) + THROTTLE_STEP);
      return { throttle1: throttle, throttle2: throttle };
    }
    case 'arrowdown': {
      const throttle = clamp01(Math.min(inputs.throttle1, inputs.throttle2) - THROTTLE_STEP);
      return { throttle1: throttle, throttle2: throttle };
    }
    case 'g':
      return { gearLever: inputs.gearLever === 'UP' ? 'DOWN' : 'UP' };
    case 'f':
      return { flapLever: nextFlapDetent(inputs.flapLever) };
    default:
      return null;
  }
}
