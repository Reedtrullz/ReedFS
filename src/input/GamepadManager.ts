import type { ControlInputs } from '../sim/types';
import type { InputActions } from './InputManager';

export interface GamepadCalibration {
  axisDeadzone: number;
  triggerDeadzone: number;
  invertElevator: boolean;
  invertAileron: boolean;
  invertRudder: boolean;
}

export const DEFAULT_GAMEPAD_CALIBRATION: GamepadCalibration = {
  axisDeadzone: 0.08,
  triggerDeadzone: 0.05,
  invertElevator: false,
  invertAileron: false,
  invertRudder: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampSigned(value: number): number {
  return clamp(value, -1, 1);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function activeAxis(value: number | undefined, deadzone: number): number | undefined {
  const v = value ?? 0;
  return Math.abs(v) < deadzone ? undefined : clampSigned(v);
}

function activeTrigger(value: number | undefined, deadzone: number): number | undefined {
  const v = value ?? 0;
  return v < deadzone ? undefined : clamp01(v);
}

function maybeInvert(value: number, inverted: boolean): number {
  return inverted ? -value : value;
}

function getFirstGamepad(): Gamepad | null {
  const nav = typeof globalThis.navigator === 'undefined' ? undefined : globalThis.navigator;
  if (!nav || typeof nav.getGamepads !== 'function') return null;

  const gamepads = nav.getGamepads();
  if (!gamepads) return null;

  return Array.from(gamepads).find((pad): pad is Gamepad => pad != null) ?? null;
}

export function __resetGamepadStateForTests(): void {
  // Gamepad input is stateless now: neutral axes/triggers simply produce no
  // action intent, so they cannot clear a keyboard/UI-controlled lever.
}

export function readGamepadActions(calibration: GamepadCalibration = DEFAULT_GAMEPAD_CALIBRATION): InputActions | null {
  const gp = getFirstGamepad();
  if (!gp) return null;

  const leftX = activeAxis(gp.axes?.[0], calibration.axisDeadzone);
  const leftY = activeAxis(gp.axes?.[1], calibration.axisDeadzone);
  const rightX = activeAxis(gp.axes?.[2], calibration.axisDeadzone);
  const rightTrigger = activeTrigger(gp.buttons?.[7]?.value, calibration.triggerDeadzone);
  const leftTrigger = activeTrigger(gp.buttons?.[6]?.value, calibration.triggerDeadzone);
  const trimNoseUp = gp.buttons?.[12]?.pressed ? 1 : 0;
  const trimNoseDown = gp.buttons?.[13]?.pressed ? 1 : 0;

  const actions: InputActions = {};

  if (leftY !== undefined) actions.pitch = maybeInvert(leftY, calibration.invertElevator);
  if (leftX !== undefined) actions.roll = maybeInvert(leftX, calibration.invertAileron);
  if (rightX !== undefined) actions.yaw = maybeInvert(rightX, calibration.invertRudder);

  if (rightTrigger !== undefined || leftTrigger !== undefined) {
    actions.throttleRate = (rightTrigger ?? 0) - (leftTrigger ?? 0);
  }

  if (trimNoseUp !== trimNoseDown) {
    actions.trimRate = trimNoseUp - trimNoseDown;
  }

  return Object.keys(actions).length > 0 ? actions : null;
}

export function readGamepad(calibration: GamepadCalibration = DEFAULT_GAMEPAD_CALIBRATION): Partial<ControlInputs> | null {
  const gp = getFirstGamepad();
  if (!gp) return null;

  const leftX = activeAxis(gp.axes?.[0], calibration.axisDeadzone);
  const leftY = activeAxis(gp.axes?.[1], calibration.axisDeadzone);
  const rightX = activeAxis(gp.axes?.[2], calibration.axisDeadzone);
  const rightTrigger = activeTrigger(gp.buttons?.[7]?.value, calibration.triggerDeadzone);
  const leftTrigger = activeTrigger(gp.buttons?.[6]?.value, calibration.triggerDeadzone);

  const inputs: Partial<ControlInputs> = {};

  if (leftY !== undefined) inputs.elevator = clampSigned(maybeInvert(leftY, calibration.invertElevator) * 0.7);
  if (leftX !== undefined) inputs.aileron = clampSigned(maybeInvert(leftX, calibration.invertAileron) * 0.7);
  if (rightX !== undefined) inputs.rudder = clampSigned(maybeInvert(rightX, calibration.invertRudder) * 0.5);

  if (rightTrigger !== undefined || leftTrigger !== undefined) {
    const throttle = clamp01(0.5 + (rightTrigger ?? 0) * 0.5 - (leftTrigger ?? 0) * 0.5);
    inputs.throttle1 = throttle;
    inputs.throttle2 = throttle;
  }

  return Object.keys(inputs).length > 0 ? inputs : null;
}
