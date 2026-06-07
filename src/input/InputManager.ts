import type { ControlInputs } from '../sim/types';

const ELEVATOR_COMMAND_RATE_PER_SECOND = 1.5;
const AILERON_COMMAND_RATE_PER_SECOND = 2.5;
const RUDDER_COMMAND_RATE_PER_SECOND = 1.8;
const CENTERING_RATE_PER_SECOND = 2;
const THROTTLE_RATE_PER_SECOND = 0.35;
const TRIM_RATE_UNITS_PER_SECOND = 1;
const MIN_TRIM_UNITS = 0;
const MAX_TRIM_UNITS = 15;

export interface InputActions {
  /** Elevator/yoke pitch intent, -1 full nose-up to +1 full nose-down. */
  pitch?: number;
  /** Aileron/yoke roll intent, -1 left to +1 right. */
  roll?: number;
  /** Rudder intent, -1 left to +1 right. */
  yaw?: number;
  /** Wheel brake intent, 0 released to 1 full braking. */
  brake?: number;
  /** Left wheel brake intent, 0 released to 1 full braking. Combined with symmetric brake by the ground model. */
  leftBrake?: number;
  /** Right wheel brake intent, 0 released to 1 full braking. Combined with symmetric brake by the ground model. */
  rightBrake?: number;
  /** Immediate latched throttle lever increment/decrement. */
  throttleDelta?: number;
  /** Continuous throttle lever rate intent, -1 decrease to +1 increase. */
  throttleRate?: number;
  /** Absolute throttle lever target, 0 idle to 1 TOGA. */
  throttleTarget?: number;
  /** Immediate stabilizer trim increment/decrement, in trim units. */
  trimDelta?: number;
  /** Continuous stabilizer trim rate intent, -1 nose-down to +1 nose-up. */
  trimRate?: number;
  /** Edge-triggered request to advance to the next published flap detent. */
  flapNext?: boolean;
  /** Edge-triggered request to toggle commanded gear UP/DOWN. */
  gearToggle?: boolean;
}

export interface InputManagerState {
  elevator: number;
  aileron: number;
  rudder: number;
  throttle: number;
  stabilizerTrimUnits: number;
  brake: number;
  leftBrake: number;
  rightBrake: number;
}

export type InputManagedControlInputs = Pick<
  ControlInputs,
  'elevator' | 'aileron' | 'rudder' | 'throttle1' | 'throttle2' | 'brake' | 'leftBrake' | 'rightBrake'
>;

function finiteOrUndefined(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampSigned(value: number): number {
  return clamp(value, -1, 1);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clampTrim(value: number): number {
  return clamp(value, MIN_TRIM_UNITS, MAX_TRIM_UNITS);
}

function sanitizeDt(dt: number): number {
  return Number.isFinite(dt) && dt > 0 ? dt : 0;
}

function moveToward(current: number, target: number, ratePerSecond: number, dt: number): number {
  const delta = target - current;
  const step = ratePerSecond * dt;
  if (Math.abs(delta) <= step) return target;
  return current + Math.sign(delta) * step;
}

function actionAxisTarget(axis: number | undefined): number | undefined {
  const value = finiteOrUndefined(axis);
  return value === undefined ? undefined : clampSigned(value);
}

function mergeAxis(current: number | undefined, next: number | undefined): number | undefined {
  const nextValue = actionAxisTarget(next);
  if (nextValue === undefined) return current;
  if (current === undefined) return nextValue;
  return Math.abs(nextValue) >= Math.abs(current) ? nextValue : current;
}

function sumDefined(...values: Array<number | undefined>): number | undefined {
  let sum = 0;
  let hasValue = false;
  for (const value of values) {
    const finite = finiteOrUndefined(value);
    if (finite === undefined) continue;
    sum += finite;
    hasValue = true;
  }
  return hasValue ? sum : undefined;
}

function lastDefined(current: number | undefined, next: number | undefined): number | undefined {
  return finiteOrUndefined(next) ?? current;
}

export function createInputManagerState(initial: Partial<InputManagerState & ControlInputs> = {}): InputManagerState {
  const throttleFromEngines =
    initial.throttle1 !== undefined || initial.throttle2 !== undefined
      ? Math.max(initial.throttle1 ?? 0, initial.throttle2 ?? 0)
      : undefined;

  return {
    elevator: clampSigned(initial.elevator ?? 0),
    aileron: clampSigned(initial.aileron ?? 0),
    rudder: clampSigned(initial.rudder ?? 0),
    throttle: clamp01(initial.throttle ?? throttleFromEngines ?? 0),
    stabilizerTrimUnits: clampTrim(initial.stabilizerTrimUnits ?? 0),
    brake: clamp01(initial.brake ?? 0),
    leftBrake: clamp01(initial.leftBrake ?? 0),
    rightBrake: clamp01(initial.rightBrake ?? 0),
  };
}

function mergeBrake(current: number | undefined, next: number | undefined): number | undefined {
  const nextValue = finiteOrUndefined(next);
  if (nextValue === undefined) return current;
  return Math.max(current ?? 0, clamp01(nextValue));
}

export function mergeInputActions(...actions: Array<InputActions | null | undefined>): InputActions {
  let pitch: number | undefined;
  let roll: number | undefined;
  let yaw: number | undefined;
  let brake: number | undefined;
  let leftBrake: number | undefined;
  let rightBrake: number | undefined;
  let throttleDelta: number | undefined;
  let throttleRate: number | undefined;
  let throttleTarget: number | undefined;
  let trimDelta: number | undefined;
  let trimRate: number | undefined;
  let flapNext = false;
  let gearToggle = false;

  for (const action of actions) {
    if (!action) continue;
    pitch = mergeAxis(pitch, action.pitch);
    roll = mergeAxis(roll, action.roll);
    yaw = mergeAxis(yaw, action.yaw);
    brake = mergeBrake(brake, action.brake);
    leftBrake = mergeBrake(leftBrake, action.leftBrake);
    rightBrake = mergeBrake(rightBrake, action.rightBrake);
    throttleDelta = sumDefined(throttleDelta, action.throttleDelta);
    throttleRate = sumDefined(throttleRate, action.throttleRate);
    throttleTarget = lastDefined(throttleTarget, action.throttleTarget);
    trimDelta = sumDefined(trimDelta, action.trimDelta);
    trimRate = sumDefined(trimRate, action.trimRate);
    flapNext = flapNext || action.flapNext === true;
    gearToggle = gearToggle || action.gearToggle === true;
  }

  const merged: InputActions = {};
  if (pitch !== undefined) merged.pitch = pitch;
  if (roll !== undefined) merged.roll = roll;
  if (yaw !== undefined) merged.yaw = yaw;
  if (brake !== undefined && brake > 0) merged.brake = brake;
  if (leftBrake !== undefined && leftBrake > 0) merged.leftBrake = leftBrake;
  if (rightBrake !== undefined && rightBrake > 0) merged.rightBrake = rightBrake;
  if (throttleDelta !== undefined) merged.throttleDelta = throttleDelta;
  if (throttleRate !== undefined) merged.throttleRate = clampSigned(throttleRate);
  if (throttleTarget !== undefined) merged.throttleTarget = clamp01(throttleTarget);
  if (trimDelta !== undefined) merged.trimDelta = trimDelta;
  if (trimRate !== undefined) merged.trimRate = clampSigned(trimRate);
  if (flapNext) merged.flapNext = true;
  if (gearToggle) merged.gearToggle = true;
  return merged;
}

export function updateInputManager(state: InputManagerState, actions: InputActions = {}, dt: number): InputManagerState {
  const frameDt = sanitizeDt(dt);
  const pitchTarget = actionAxisTarget(actions.pitch) ?? 0;
  const rollTarget = actionAxisTarget(actions.roll) ?? 0;
  const yawTarget = actionAxisTarget(actions.yaw) ?? 0;
  const elevatorRate = actions.pitch === undefined ? CENTERING_RATE_PER_SECOND : ELEVATOR_COMMAND_RATE_PER_SECOND;
  const aileronRate = actions.roll === undefined ? CENTERING_RATE_PER_SECOND : AILERON_COMMAND_RATE_PER_SECOND;
  const rudderRate = actions.yaw === undefined ? CENTERING_RATE_PER_SECOND : RUDDER_COMMAND_RATE_PER_SECOND;

  let throttle = clamp01(state.throttle);
  const throttleTarget = finiteOrUndefined(actions.throttleTarget);
  if (throttleTarget !== undefined) {
    throttle = moveToward(throttle, clamp01(throttleTarget), THROTTLE_RATE_PER_SECOND, frameDt);
  }
  const throttleRate = finiteOrUndefined(actions.throttleRate);
  if (throttleRate !== undefined) {
    throttle += clampSigned(throttleRate) * THROTTLE_RATE_PER_SECOND * frameDt;
  }
  const throttleDelta = finiteOrUndefined(actions.throttleDelta);
  if (throttleDelta !== undefined) {
    throttle += throttleDelta;
  }

  let stabilizerTrimUnits = clampTrim(state.stabilizerTrimUnits);
  const trimRate = finiteOrUndefined(actions.trimRate);
  if (trimRate !== undefined) {
    stabilizerTrimUnits += clampSigned(trimRate) * TRIM_RATE_UNITS_PER_SECOND * frameDt;
  }
  const trimDelta = finiteOrUndefined(actions.trimDelta);
  if (trimDelta !== undefined) {
    stabilizerTrimUnits += trimDelta;
  }

  return {
    elevator: clampSigned(moveToward(clampSigned(state.elevator), pitchTarget, elevatorRate, frameDt)),
    aileron: clampSigned(moveToward(clampSigned(state.aileron), rollTarget, aileronRate, frameDt)),
    rudder: clampSigned(moveToward(clampSigned(state.rudder), yawTarget, rudderRate, frameDt)),
    throttle: clamp01(throttle),
    stabilizerTrimUnits: clampTrim(stabilizerTrimUnits),
    brake: clamp01(actions.brake ?? 0),
    leftBrake: clamp01(actions.leftBrake ?? 0),
    rightBrake: clamp01(actions.rightBrake ?? 0),
  };
}

export function inputManagerStateToControlInputs(state: InputManagerState): InputManagedControlInputs {
  const throttle = clamp01(state.throttle);
  return {
    elevator: clampSigned(state.elevator),
    aileron: clampSigned(state.aileron),
    rudder: clampSigned(state.rudder),
    throttle1: throttle,
    throttle2: throttle,
    brake: clamp01(state.brake),
    leftBrake: clamp01(state.leftBrake),
    rightBrake: clamp01(state.rightBrake),
  };
}
