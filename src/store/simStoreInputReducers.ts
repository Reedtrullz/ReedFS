import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { AircraftState, ControlInputs } from '../sim/types';
import type { SimulationStatus } from '../sim/simulationStatus';
import type { FlightScenario } from '../sim/scenarios';
import { isAutopilotEngaged } from '../sim/systems/autopilot';
import {
  createInputManagerState,
  updateInputManager,
  type InputActions,
  type InputManagerState,
} from '../input/InputManager';
import { nextB737FlapDetent } from '../input/flapDetents';

export const defaultInputs: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0,
  throttle2: 0,
  flapLever: 0,
  gearLever: 'DOWN',
  spoilers: 0,
  brake: 0,
  leftBrake: 0,
  rightBrake: 0,
};

export function normalizeControlInputs(inputs: ControlInputs): ControlInputs {
  return {
    ...inputs,
    leftBrake: 0,
    rightBrake: 0,
  };
}

export function inputsForScenario(scenario: FlightScenario): ControlInputs {
  return { ...defaultInputs, flapLever: scenario.flapSetting, gearLever: 'DOWN' };
}

export function inputManagerForScenario(scenario: FlightScenario): InputManagerState {
  return createInputManagerState({
    ...inputsForScenario(scenario),
    stabilizerTrimUnits: scenario.stabilizerTrimUnits,
  });
}

export function syncInputManagerWithInputPartial(
  inputManager: InputManagerState,
  partial: Partial<ControlInputs>,
): InputManagerState {
  const next: InputManagerState = { ...inputManager };
  if (partial.elevator !== undefined) next.elevator = 0;
  if (partial.aileron !== undefined) next.aileron = 0;
  if (partial.rudder !== undefined) next.rudder = 0;
  if (partial.brake !== undefined) next.brake = 0;
  if (partial.leftBrake !== undefined) next.leftBrake = 0;
  if (partial.rightBrake !== undefined) next.rightBrake = 0;

  if (partial.throttle1 !== undefined && partial.throttle2 !== undefined) {
    next.throttle = Math.max(partial.throttle1, partial.throttle2);
  }

  return createInputManagerState(next);
}

export function inputActionsIncludeThrottle(actions: InputActions): boolean {
  return (
    actions.throttleDelta !== undefined ||
    actions.throttleRate !== undefined ||
    actions.throttleTarget !== undefined
  );
}

function inputActionsChangedThrottle(actions: InputActions, previous: InputManagerState, next: InputManagerState): boolean {
  return inputActionsIncludeThrottle(actions) || previous.throttle !== next.throttle;
}

export function seedInputManagerFromLiveInputs(
  inputManager: InputManagerState,
  inputs: ControlInputs,
  actions: InputActions,
): InputManagerState {
  const seed: InputManagerState = { ...inputManager };
  if (actions.pitch !== undefined) seed.elevator = inputs.elevator;
  else if (inputManager.elevator !== inputs.elevator) seed.elevator = 0;
  if (actions.roll !== undefined) seed.aileron = inputs.aileron;
  else if (inputManager.aileron !== inputs.aileron) seed.aileron = 0;
  if (actions.yaw !== undefined) seed.rudder = inputs.rudder;
  else if (inputManager.rudder !== inputs.rudder) seed.rudder = 0;
  if (actions.brake !== undefined) seed.brake = inputs.brake;
  else if (inputManager.brake !== inputs.brake) seed.brake = 0;
  if (actions.leftBrake !== undefined) seed.leftBrake = inputs.leftBrake ?? 0;
  else if (inputManager.leftBrake !== (inputs.leftBrake ?? 0)) seed.leftBrake = 0;
  if (actions.rightBrake !== undefined) seed.rightBrake = inputs.rightBrake ?? 0;
  else if (inputManager.rightBrake !== (inputs.rightBrake ?? 0)) seed.rightBrake = 0;
  if (inputActionsIncludeThrottle(actions)) seed.throttle = Math.max(inputs.throttle1, inputs.throttle2);
  return createInputManagerState(seed);
}

export function controlPatchFromInputManager(
  current: ControlInputs,
  previous: InputManagerState,
  next: InputManagerState,
  actions: InputActions,
): Partial<ControlInputs> {
  const patch: Partial<ControlInputs> = {};

  if (actions.pitch !== undefined || previous.elevator !== next.elevator) patch.elevator = next.elevator;
  if (actions.roll !== undefined || previous.aileron !== next.aileron) patch.aileron = next.aileron;
  if (actions.yaw !== undefined || previous.rudder !== next.rudder) patch.rudder = next.rudder;
  if (actions.brake !== undefined || previous.brake !== next.brake) patch.brake = next.brake;
  if (actions.leftBrake !== undefined || previous.leftBrake !== next.leftBrake) patch.leftBrake = next.leftBrake;
  if (actions.rightBrake !== undefined || previous.rightBrake !== next.rightBrake) patch.rightBrake = next.rightBrake;
  if (inputActionsChangedThrottle(actions, previous, next)) {
    patch.throttle1 = next.throttle;
    patch.throttle2 = next.throttle;
  }
  if (actions.flapNext) patch.flapLever = nextB737FlapDetent(current.flapLever);
  if (actions.gearToggle) patch.gearLever = current.gearLever === 'UP' ? 'DOWN' : 'UP';

  return patch;
}

export function reduceInputManagerActions(args: {
  inputManager: InputManagerState;
  pilotInputs: ControlInputs;
  actions: InputActions;
  dt: number;
}): { inputManager: InputManagerState; inputPatch: Partial<ControlInputs> } {
  const previousInputManager = seedInputManagerFromLiveInputs(args.inputManager, args.pilotInputs, args.actions);
  const inputManager = updateInputManager(previousInputManager, args.actions, args.dt);
  return {
    inputManager,
    inputPatch: controlPatchFromInputManager(args.pilotInputs, previousInputManager, inputManager, args.actions),
  };
}

export function isRejectedTakeoffAbortLatched(status: SimulationStatus, aircraft: AircraftState, inputs: ControlInputs): boolean {
  return status === 'running'
    && aircraft.flightPhase === 'TAKEOFF'
    && aircraft.ground.weightOnWheels
    && inputs.throttle1 <= 0.2
    && inputs.throttle2 <= 0.2
    && inputs.brake >= 0.8
    && inputs.spoilers >= 0.95;
}

const AP_OWNED_INPUT_KEYS = ['elevator', 'aileron', 'throttle1', 'throttle2'] as const;

export function sanitizeSetInputPartial(
  partial: Partial<ControlInputs>,
  pilotInputs: ControlInputs,
  effectiveControls: ControlInputs,
  apActive: boolean,
  apOwnsThrust: boolean,
): { pilotPatch: Partial<ControlInputs>; shouldDisconnect: boolean } {
  if (!apActive) return { pilotPatch: partial, shouldDisconnect: false };

  const pilotPatch: Partial<ControlInputs> = { ...partial };
  let shouldDisconnect = false;

  for (const key of AP_OWNED_INPUT_KEYS) {
    const value = partial[key];
    if (value === undefined) continue;

    // Throttle input is silently ignored when AP owns thrust.
    if (apOwnsThrust && (key === 'throttle1' || key === 'throttle2')) {
      delete pilotPatch[key];
      continue;
    }

    if (value === effectiveControls[key] && value !== pilotInputs[key]) {
      delete pilotPatch[key];
      continue;
    }

    if (value !== effectiveControls[key]) {
      shouldDisconnect = true;
    }
  }

  return { pilotPatch, shouldDisconnect };
}

export function inputActionsIncludeManualApAxis(actions: InputActions, apState: AutopilotState | null): boolean {
  if (!isAutopilotEngaged(apState)) return false;
  if (actions.pitch !== undefined || actions.roll !== undefined) return true;
  const apOwnsThrust = apState && (apState.truth.thrustActive === 'SPEED' || apState.truth.thrustActive === 'N1');
  return !apOwnsThrust && inputActionsIncludeThrottle(actions);
}
