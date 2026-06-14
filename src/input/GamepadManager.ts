import type { ControlInputs } from '../sim/types';
import type { InputActions } from './InputManager';

export type GamepadCommand =
  | 'startPause'
  | 'reset'
  | 'camera'
  | 'overlay'
  | 'audio'
  | 'mcpFdLeft'
  | 'mcpHdgSel'
  | 'mcpAltHold'
  | 'mcpSpeed';

export interface GamepadInputActions extends InputActions {
  /** Edge-triggered non-axis simulator/gamepad commands for the app shell. */
  commands?: GamepadCommand[];
}

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

const FLAP_NEXT_BUTTON = 4;
const GEAR_TOGGLE_BUTTON = 5;
const COMMAND_BUTTONS: ReadonlyArray<readonly [number, GamepadCommand]> = [
  [2, 'camera'],
  [1, 'overlay'],
  [3, 'audio'],
  [8, 'reset'],
  [9, 'startPause'],
  [10, 'mcpFdLeft'],
  [11, 'mcpHdgSel'],
  [14, 'mcpAltHold'],
  [15, 'mcpSpeed'],
];

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

let previousPressedButtons = new Set<number>();

function buttonPressed(gp: Gamepad, index: number): boolean {
  return gp.buttons?.[index]?.pressed === true || (gp.buttons?.[index]?.value ?? 0) > 0.5;
}

function pressedButtonSet(gp: Gamepad): Set<number> {
  const pressed = new Set<number>();
  for (let index = 0; index < (gp.buttons?.length ?? 0); index += 1) {
    if (buttonPressed(gp, index)) pressed.add(index);
  }
  return pressed;
}

function edgePressed(pressed: ReadonlySet<number>, index: number): boolean {
  return pressed.has(index) && !previousPressedButtons.has(index);
}

export function __resetGamepadStateForTests(): void {
  previousPressedButtons = new Set<number>();
}

export function readGamepadActions(calibration: GamepadCalibration = DEFAULT_GAMEPAD_CALIBRATION): GamepadInputActions | null {
  const gp = getFirstGamepad();
  if (!gp) return null;

  const leftX = activeAxis(gp.axes?.[0], calibration.axisDeadzone);
  const leftY = activeAxis(gp.axes?.[1], calibration.axisDeadzone);
  const rightX = activeAxis(gp.axes?.[2], calibration.axisDeadzone);
  const rightTrigger = activeTrigger(gp.buttons?.[7]?.value, calibration.triggerDeadzone);
  const leftTrigger = activeTrigger(gp.buttons?.[6]?.value, calibration.triggerDeadzone);
  const trimNoseUp = gp.buttons?.[12]?.pressed ? 1 : 0;
  const trimNoseDown = gp.buttons?.[13]?.pressed ? 1 : 0;
  const brakeButton = buttonPressed(gp, 0) ? 1 : 0;
  const pressed = pressedButtonSet(gp);
  const flapButtonPressed = edgePressed(pressed, FLAP_NEXT_BUTTON);
  const gearButtonPressed = edgePressed(pressed, GEAR_TOGGLE_BUTTON);

  const actions: GamepadInputActions = {};

  if (leftY !== undefined) actions.pitch = maybeInvert(leftY, calibration.invertElevator);
  if (leftX !== undefined) actions.roll = maybeInvert(leftX, calibration.invertAileron);
  if (rightX !== undefined) actions.yaw = maybeInvert(rightX, calibration.invertRudder);

  if (rightTrigger !== undefined || leftTrigger !== undefined) {
    actions.throttleRate = (rightTrigger ?? 0) - (leftTrigger ?? 0);
  }

  if (trimNoseUp !== trimNoseDown) {
    actions.trimRate = trimNoseUp - trimNoseDown;
  }

  if (brakeButton > 0) actions.brake = brakeButton;
  if (flapButtonPressed) actions.flapNext = true;
  if (gearButtonPressed) actions.gearToggle = true;

  const commands = COMMAND_BUTTONS
    .filter(([buttonIndex]) => edgePressed(pressed, buttonIndex))
    .map(([, command]) => command);
  if (commands.length > 0) actions.commands = commands;

  previousPressedButtons = pressed;
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
