import { create } from 'zustand';
import type { AircraftState, ControlInputs, AircraftSpec } from '../sim/types';
import { B737_800_SPEC } from '../sim/types';
import { integrate } from '../sim/physics/integrate';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../sim/weather';
import { KSEA_TUTORIAL_SCENARIO, createAircraftStateForScenario, scenarioById } from '../sim/scenarios';
import type { FlightScenario } from '../sim/scenarios';
import {
  createInputManagerState,
  updateInputManager,
  type InputActions,
  type InputManagerState,
} from '../input/InputManager';

export type SimStatus = 'stopped' | 'running' | 'paused';

export interface SimStore {
  aircraft: AircraftState;
  inputs: ControlInputs;
  inputManager: InputManagerState;
  spec: AircraftSpec;
  status: SimStatus;
  lastFrameTime: number;
  apState: AutopilotState | null;
  flightPlan: FlightPlan | null;
  wind: WindInfo | null;
  selectedScenarioId: string;
  setInput: (partial: Partial<ControlInputs>) => void;
  applyInputActions: (actions: InputActions, dt: number) => void;
  tick: (timestamp: number) => void;
  start: () => void;
  startTakeoffRoll: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setScenario: (scenarioId: string) => void;
  setApState: (ap: AutopilotState | null) => void;
  setFlightPlan: (fp: FlightPlan | null) => void;
  setWind: (w: WindInfo | null) => void;
}

const defaultInputs: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN',
  spoilers: 0, brake: 0,
};

function cloneWind(wind: WindInfo): WindInfo {
  return { ...wind };
}

function inputsForScenario(scenario: FlightScenario): ControlInputs {
  return { ...defaultInputs, flapLever: scenario.flapSetting, gearLever: 'DOWN' };
}

function inputManagerForScenario(scenario: FlightScenario): InputManagerState {
  return createInputManagerState({
    ...inputsForScenario(scenario),
    stabilizerTrimUnits: scenario.stabilizerTrimUnits,
  });
}

function syncInputManagerWithInputPartial(
  inputManager: InputManagerState,
  partial: Partial<ControlInputs>,
): InputManagerState {
  const next: InputManagerState = { ...inputManager };
  if (partial.elevator !== undefined) next.elevator = 0;
  if (partial.aileron !== undefined) next.aileron = 0;
  if (partial.rudder !== undefined) next.rudder = 0;
  if (partial.brake !== undefined) next.brake = 0;

  if (partial.throttle1 !== undefined && partial.throttle2 !== undefined) {
    next.throttle = Math.max(partial.throttle1, partial.throttle2);
  }

  return createInputManagerState(next);
}

function inputActionsIncludeThrottle(actions: InputActions): boolean {
  return (
    actions.throttleDelta !== undefined ||
    actions.throttleRate !== undefined ||
    actions.throttleTarget !== undefined
  );
}

function inputActionsChangedThrottle(actions: InputActions, previous: InputManagerState, next: InputManagerState): boolean {
  return inputActionsIncludeThrottle(actions) || previous.throttle !== next.throttle;
}

function seedInputManagerFromLiveInputs(
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
  if (inputActionsIncludeThrottle(actions)) seed.throttle = Math.max(inputs.throttle1, inputs.throttle2);
  return createInputManagerState(seed);
}

function controlPatchFromInputManager(
  previous: InputManagerState,
  next: InputManagerState,
  actions: InputActions,
): Partial<ControlInputs> {
  const patch: Partial<ControlInputs> = {};

  if (actions.pitch !== undefined || previous.elevator !== next.elevator) patch.elevator = next.elevator;
  if (actions.roll !== undefined || previous.aileron !== next.aileron) patch.aileron = next.aileron;
  if (actions.yaw !== undefined || previous.rudder !== next.rudder) patch.rudder = next.rudder;
  if (actions.brake !== undefined || previous.brake !== next.brake) patch.brake = next.brake;
  if (inputActionsChangedThrottle(actions, previous, next)) {
    patch.throttle1 = next.throttle;
    patch.throttle2 = next.throttle;
  }

  return patch;
}

export const useSimStore = create<SimStore>((set, get) => ({
  aircraft: createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO),
  inputs: inputsForScenario(KSEA_TUTORIAL_SCENARIO),
  inputManager: inputManagerForScenario(KSEA_TUTORIAL_SCENARIO),
  spec: B737_800_SPEC,
  status: 'stopped',
  lastFrameTime: 0,
  apState: null,
  flightPlan: null,
  wind: cloneWind(KSEA_TUTORIAL_SCENARIO.wind),
  selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,

  setInput: (partial) =>
    set((s) => ({
      inputs: { ...s.inputs, ...partial },
      inputManager: syncInputManagerWithInputPartial(s.inputManager, partial),
    })),

  applyInputActions: (actions, dt) =>
    set((s) => {
      const previousInputManager = seedInputManagerFromLiveInputs(s.inputManager, s.inputs, actions);
      const inputManager = updateInputManager(previousInputManager, actions, dt);
      const inputPatch = controlPatchFromInputManager(previousInputManager, inputManager, actions);
      const trimChanged = inputManager.stabilizerTrimUnits !== s.aircraft.config.stabilizerTrimUnits;
      const aircraft = trimChanged ? structuredClone(s.aircraft) : s.aircraft;
      if (trimChanged) {
        aircraft.config.stabilizerTrimUnits = inputManager.stabilizerTrimUnits;
      }

      return {
        inputManager,
        inputs: Object.keys(inputPatch).length > 0 ? { ...s.inputs, ...inputPatch } : s.inputs,
        aircraft,
      };
    }),

  tick: (timestamp: number) => {
    const { status, lastFrameTime, aircraft, inputs, spec, apState, flightPlan, wind } = get();
    if (status !== 'running') return;
    const dt = lastFrameTime > 0 ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 1 / 60;
    const state = structuredClone(aircraft);
    integrate(state, inputs, spec, dt, apState, flightPlan, wind);
    set({ aircraft: state, lastFrameTime: timestamp });
  },

  start: () => set({ status: 'running', lastFrameTime: 0 }),
  startTakeoffRoll: () => set((s) => {
    const aircraft = structuredClone(s.aircraft);
    aircraft.flightPhase = 'TAKEOFF';
    const inputs: ControlInputs = {
      ...s.inputs,
      throttle1: 1,
      throttle2: 1,
      flapLever: aircraft.config.flapSetting,
      gearLever: 'DOWN',
      brake: 0,
      elevator: 0,
    };
    return {
      aircraft,
      inputs,
      inputManager: createInputManagerState({
        ...inputs,
        stabilizerTrimUnits: aircraft.config.stabilizerTrimUnits,
      }),
      status: 'running',
      lastFrameTime: 0,
    };
  }),
  pause: () => set({ status: 'paused' }),
  resume: () => set({ status: 'running', lastFrameTime: 0 }),
  reset: () => set((s) => {
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      aircraft: createAircraftStateForScenario(B737_800_SPEC, scenario),
      inputs: inputsForScenario(scenario),
      inputManager: inputManagerForScenario(scenario),
      status: 'stopped',
      lastFrameTime: 0,
      apState: null,
      flightPlan: null,
      wind: cloneWind(scenario.wind),
    };
  }),

  setScenario: (scenarioId) => set(() => {
    const scenario = scenarioById(scenarioId);
    return {
      selectedScenarioId: scenario.id,
      aircraft: createAircraftStateForScenario(B737_800_SPEC, scenario),
      inputs: inputsForScenario(scenario),
      inputManager: inputManagerForScenario(scenario),
      status: 'stopped',
      lastFrameTime: 0,
      apState: null,
      flightPlan: null,
      wind: cloneWind(scenario.wind),
    };
  }),

  setApState: (ap) => set({ apState: ap }),
  setFlightPlan: (fp) => set({ flightPlan: fp }),
  setWind: (w) => set({ wind: w }),
}));
