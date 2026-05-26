import { create } from 'zustand';
import type { AircraftState, AutopilotCommands, ControlInputs, AircraftSpec } from '../sim/types';
import { B737_800_SPEC } from '../sim/types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../sim/weather';
import { KSEA_TUTORIAL_SCENARIO, createAircraftStateForScenario, scenarioById } from '../sim/scenarios';
import type { FlightScenario } from '../sim/scenarios';
import { buildGuidanceState, type GuidanceState } from '../sim/guidanceState';
import {
  advanceSimulationStep,
  composeControlsSlice,
  syncGuidanceState,
} from '../sim/simulationStep';
import type { SimulationStatus } from '../sim/simulationStatus';
import {
  computeRouteStatus,
  createNoRouteStatus,
  getInitialActiveLegIndex,
  type RouteStatusSnapshot,
} from '../sim/systems/navigation';
import {
  isAutopilotEngaged,
  resetAutopilotPID,
} from '../sim/systems/autopilot';
import {
  createInputManagerState,
  updateInputManager,
  type InputActions,
  type InputManagerState,
} from '../input/InputManager';

import {
  createScenarioSnapshot,
  loadScenarioSnapshot,
  saveScenarioSnapshot,
  type ScenarioPersistenceStorage,
  type ScenarioSnapshot,
} from './scenarioPersistence';

export type SimStatus = SimulationStatus;

export interface SimStore {
  aircraft: AircraftState;
  /** Legacy alias for effectiveControls. Keep this object identical to effectiveControls for existing UI/tests. */
  inputs: ControlInputs;
  /** Pilot-authored controls from keyboard/gamepad/UI. Autopilot must never mutate this object. */
  pilotInputs: ControlInputs;
  /** Autopilot-authored axis commands. Pilot-owned gear/flaps/spoilers are never stored here. */
  apCommands: AutopilotCommands;
  /** The controls actually sent to systems/physics after pilot + AP ownership composition. */
  effectiveControls: ControlInputs;
  inputManager: InputManagerState;
  spec: AircraftSpec;
  status: SimStatus;
  lastFrameTime: number;
  fixedStepAccumulatorSeconds: number;
  simulationTimeSeconds: number;
  droppedSimulationTimeSeconds: number;
  apState: AutopilotState | null;
  flightPlan: FlightPlan | null;
  activeLegIndex: number | null;
  routeStatus: RouteStatusSnapshot;
  wind: WindInfo | null;
  selectedScenarioId: string;
  guidance: GuidanceState;
  scenarioPersistenceMessage: string | null;
  setInput: (partial: Partial<ControlInputs>) => void;
  applyInputActions: (actions: InputActions, dt: number) => void;
  tick: (timestamp: number) => void;
  start: () => void;
  startTakeoffRoll: () => void;
  abortTakeoff: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setScenario: (scenarioId: string) => void;
  setTutorialStep: (stepIndex: number) => void;
  setApState: (ap: AutopilotState | null) => void;
  setFlightPlan: (fp: FlightPlan | null) => void;
  setWind: (w: WindInfo | null) => void;
  saveScenarioState: (storage?: ScenarioPersistenceStorage) => void;
  loadScenarioState: (storage?: ScenarioPersistenceStorage) => void;
}

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 16;

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

function isRejectedTakeoffAbortLatched(status: SimStatus, aircraft: AircraftState, inputs: ControlInputs): boolean {
  return status === 'running'
    && aircraft.flightPhase === 'TAKEOFF'
    && aircraft.ground.weightOnWheels
    && inputs.throttle1 <= 0.2
    && inputs.throttle2 <= 0.2
    && inputs.brake >= 0.8
    && inputs.spoilers >= 0.95;
}

const AP_OWNED_INPUT_KEYS = ['elevator', 'aileron', 'throttle1', 'throttle2'] as const;

function sanitizeSetInputPartial(
  partial: Partial<ControlInputs>,
  pilotInputs: ControlInputs,
  effectiveControls: ControlInputs,
  apActive: boolean,
): { pilotPatch: Partial<ControlInputs>; shouldDisconnect: boolean } {
  if (!apActive) return { pilotPatch: partial, shouldDisconnect: false };

  const pilotPatch: Partial<ControlInputs> = { ...partial };
  let shouldDisconnect = false;

  for (const key of AP_OWNED_INPUT_KEYS) {
    const value = partial[key];
    if (value === undefined) continue;

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

function inputActionsIncludeManualApAxis(actions: InputActions): boolean {
  return actions.pitch !== undefined || actions.roll !== undefined || inputActionsIncludeThrottle(actions);
}

function autopilotModesChanged(previous: AutopilotState | null, next: AutopilotState | null): boolean {
  if (!previous || !next) return previous !== next;
  return (
    previous.truth.autopilotStatus !== next.truth.autopilotStatus ||
    previous.truth.lateralActive !== next.truth.lateralActive ||
    previous.truth.verticalActive !== next.truth.verticalActive ||
    previous.truth.thrustActive !== next.truth.thrustActive
  );
}

function disconnectAutopilot(apState: AutopilotState | null): AutopilotState | null {
  if (!apState) return null;
  resetAutopilotPID();
  const next = structuredClone(apState);
  next.truth = {
    ...next.truth,
    autopilotStatus: 'OFF',
    lateralActive: 'OFF',
    verticalActive: 'OFF',
    thrustActive: 'OFF',
  };
  next.boeing = {
    ...next.boeing,
    cmdA: false,
    cmdB: false,
    cwsA: false,
    cwsB: false,
    speedMode: false,
    lnav: false,
    vnav: false,
    hdgSel: false,
    vorLoc: false,
    app: false,
    altHold: false,
    vs: false,
  };
  next.airbus = {
    ...next.airbus,
    ap1: false,
    ap2: false,
    athr: false,
    loc: false,
    appr: false,
  };
  return next;
}

const initialPilotInputs = inputsForScenario(KSEA_TUTORIAL_SCENARIO);
const initialControls = composeControlsSlice(initialPilotInputs);
const initialAircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
const initialGuidance = buildGuidanceState({
  scenario: KSEA_TUTORIAL_SCENARIO,
  status: 'stopped',
  aircraft: initialAircraft,
  controls: initialControls.effectiveControls,
});
const initialRouteStatus = createNoRouteStatus();

function defaultScenarioStorage(): ScenarioPersistenceStorage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

function restoreSnapshotSlice(snapshot: ScenarioSnapshot): Partial<SimStore> {
  const aircraft = structuredClone(snapshot.aircraft);
  const apState = structuredClone(snapshot.apState);
  const apCommands = structuredClone(snapshot.apCommands);
  const pilotInputs = structuredClone(snapshot.pilotInputs);
  const flightPlan = structuredClone(snapshot.flightPlan);
  const activeLegIndex = snapshot.activeLegIndex;
  const controlsSlice = composeControlsSlice(pilotInputs, apCommands, apState);
  const routeStatus = flightPlan ? computeRouteStatus(aircraft, flightPlan, activeLegIndex) : createNoRouteStatus();
  const scenario = scenarioById(snapshot.selectedScenarioId);
  const restoredStatus: SimStatus = snapshot.status === 'running' ? 'paused' : snapshot.status;
  const scenarioPersistenceMessage = snapshot.status === 'running'
    ? 'Saved scenario loaded paused.'
    : 'Saved scenario loaded.';

  return {
    selectedScenarioId: scenario.id,
    aircraft,
    ...controlsSlice,
    inputManager: structuredClone(snapshot.inputManager),
    status: restoredStatus,
    lastFrameTime: 0,
    fixedStepAccumulatorSeconds: 0,
    simulationTimeSeconds: snapshot.simulationTimeSeconds,
    droppedSimulationTimeSeconds: 0,
    apState,
    flightPlan,
    activeLegIndex: routeStatus.activeLegIndex,
    routeStatus,
    wind: structuredClone(snapshot.wind),
    guidance: buildGuidanceState({
      scenario,
      status: restoredStatus,
      aircraft,
      controls: controlsSlice.effectiveControls,
    }),
    scenarioPersistenceMessage,
  };
}

export const useSimStore = create<SimStore>((set, get) => ({
  aircraft: initialAircraft,
  ...initialControls,
  inputManager: inputManagerForScenario(KSEA_TUTORIAL_SCENARIO),
  spec: B737_800_SPEC,
  status: 'stopped',
  lastFrameTime: 0,
  fixedStepAccumulatorSeconds: 0,
  simulationTimeSeconds: 0,
  droppedSimulationTimeSeconds: 0,
  apState: null,
  flightPlan: null,
  activeLegIndex: null,
  routeStatus: initialRouteStatus,
  wind: cloneWind(KSEA_TUTORIAL_SCENARIO.wind),
  selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
  guidance: initialGuidance,
  scenarioPersistenceMessage: null,

  setInput: (partial) =>
    set((s) => {
      const apActive = isAutopilotEngaged(s.apState);
      const { pilotPatch, shouldDisconnect } = sanitizeSetInputPartial(
        partial,
        s.pilotInputs,
        s.effectiveControls,
        apActive,
      );
      const pilotInputs = { ...s.pilotInputs, ...pilotPatch };
      const apState = shouldDisconnect ? disconnectAutopilot(s.apState) : s.apState;
      const apCommands = shouldDisconnect ? {} : s.apCommands;
      const controlsSlice = composeControlsSlice(pilotInputs, apCommands, apState);
      const scenario = scenarioById(s.selectedScenarioId);
      return {
        ...controlsSlice,
        apState,
        inputManager: syncInputManagerWithInputPartial(s.inputManager, pilotPatch),
        guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, controlsSlice.effectiveControls),
      };
    }),

  applyInputActions: (actions, dt) =>
    set((s) => {
      const previousInputManager = seedInputManagerFromLiveInputs(s.inputManager, s.pilotInputs, actions);
      const inputManager = updateInputManager(previousInputManager, actions, dt);
      let inputPatch = controlPatchFromInputManager(previousInputManager, inputManager, actions);
      if (isRejectedTakeoffAbortLatched(s.status, s.aircraft, s.pilotInputs)) {
        inputPatch = {
          ...inputPatch,
          throttle1: 0,
          throttle2: 0,
          brake: 1,
          spoilers: 1,
        };
      }
      const trimChanged = inputManager.stabilizerTrimUnits !== s.aircraft.config.stabilizerTrimUnits;
      const aircraft = trimChanged ? structuredClone(s.aircraft) : s.aircraft;
      if (trimChanged) {
        aircraft.config.stabilizerTrimUnits = inputManager.stabilizerTrimUnits;
      }

      const pilotInputs = Object.keys(inputPatch).length > 0 ? { ...s.pilotInputs, ...inputPatch } : s.pilotInputs;
      const shouldDisconnect = isAutopilotEngaged(s.apState) && inputActionsIncludeManualApAxis(actions);
      const apState = shouldDisconnect ? disconnectAutopilot(s.apState) : s.apState;
      const apCommands = shouldDisconnect ? {} : s.apCommands;
      const controlsSlice = composeControlsSlice(pilotInputs, apCommands, apState);
      const scenario = scenarioById(s.selectedScenarioId);

      return {
        ...controlsSlice,
        inputManager,
        aircraft,
        apState,
        guidance: syncGuidanceState(s.guidance, scenario, s.status, aircraft, controlsSlice.effectiveControls),
      };
    }),

  tick: (timestamp: number) => {
    const {
      status,
      lastFrameTime,
      fixedStepAccumulatorSeconds,
      simulationTimeSeconds,
      droppedSimulationTimeSeconds,
      aircraft,
      pilotInputs,
      spec,
      apState,
      flightPlan,
      activeLegIndex,
      routeStatus,
      wind,
      selectedScenarioId,
      guidance,
    } = get();
    if (status !== 'running') return;

    const frameDeltaSeconds = lastFrameTime > 0
      ? Math.max(0, (timestamp - lastFrameTime) / 1000)
      : FIXED_STEP_SECONDS;
    let accumulator = fixedStepAccumulatorSeconds + frameDeltaSeconds;
    let stepCount = Math.floor(accumulator / FIXED_STEP_SECONDS);
    let droppedTime = droppedSimulationTimeSeconds;

    if (stepCount > MAX_STEPS_PER_FRAME) {
      const executableTime = MAX_STEPS_PER_FRAME * FIXED_STEP_SECONDS;
      droppedTime += accumulator - executableTime;
      accumulator = executableTime;
      stepCount = MAX_STEPS_PER_FRAME;
    }

    if (stepCount <= 0) {
      set({
        lastFrameTime: timestamp,
        fixedStepAccumulatorSeconds: accumulator,
        droppedSimulationTimeSeconds: droppedTime,
      });
      return;
    }

    let nextAircraft = aircraft;
    let nextActiveLegIndex = activeLegIndex;
    let nextRouteStatus = routeStatus;
    let nextGuidance = guidance;
    let nextControls = composeControlsSlice(pilotInputs, get().apCommands, apState);

    for (let step = 0; step < stepCount; step++) {
      const next = advanceSimulationStep({
        aircraft: nextAircraft,
        spec,
        pilotInputs,
        apState,
        flightPlan,
        activeLegIndex: nextActiveLegIndex,
        routeStatus: nextRouteStatus,
        wind,
        dt: FIXED_STEP_SECONDS,
        status,
        selectedScenarioId,
        guidance: nextGuidance,
      });
      nextAircraft = next.aircraft;
      nextControls = next.controls;
      nextActiveLegIndex = next.activeLegIndex;
      nextRouteStatus = next.routeStatus;
      nextGuidance = next.guidance;
    }

    accumulator -= stepCount * FIXED_STEP_SECONDS;
    if (Math.abs(accumulator) < 1e-12) accumulator = 0;

    set({
      aircraft: nextAircraft,
      lastFrameTime: timestamp,
      fixedStepAccumulatorSeconds: accumulator,
      simulationTimeSeconds: simulationTimeSeconds + stepCount * FIXED_STEP_SECONDS,
      droppedSimulationTimeSeconds: droppedTime,
      ...nextControls,
      activeLegIndex: nextActiveLegIndex,
      routeStatus: nextRouteStatus,
      guidance: nextGuidance,
    });
  },

  start: () => set((s) => {
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      status: 'running',
      lastFrameTime: 0,
      fixedStepAccumulatorSeconds: 0,
      guidance: syncGuidanceState(s.guidance, scenario, 'running', s.aircraft, s.effectiveControls),
    };
  }),
  startTakeoffRoll: () => set((s) => {
    const aircraft = structuredClone(s.aircraft);
    aircraft.flightPhase = 'TAKEOFF';
    const pilotInputs: ControlInputs = {
      ...s.pilotInputs,
      throttle1: 1,
      throttle2: 1,
      flapLever: aircraft.config.flapSetting,
      gearLever: 'DOWN',
      brake: 0,
      elevator: 0,
    };
    resetAutopilotPID();
    const controlsSlice = composeControlsSlice(pilotInputs);
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      aircraft,
      ...controlsSlice,
      inputManager: createInputManagerState({
        ...pilotInputs,
        stabilizerTrimUnits: aircraft.config.stabilizerTrimUnits,
      }),
      apState: null,
      status: 'running',
      lastFrameTime: 0,
      fixedStepAccumulatorSeconds: 0,
      simulationTimeSeconds: 0,
      droppedSimulationTimeSeconds: 0,
      guidance: syncGuidanceState(s.guidance, scenario, 'running', aircraft, controlsSlice.effectiveControls),
    };
  }),

  abortTakeoff: () => set((s) => {
    const aircraft = structuredClone(s.aircraft);
    if (aircraft.ground.weightOnWheels) aircraft.flightPhase = 'TAKEOFF';
    const pilotInputs: ControlInputs = {
      ...s.pilotInputs,
      throttle1: 0,
      throttle2: 0,
      brake: 1,
      spoilers: 1,
      elevator: 0,
      gearLever: 'DOWN',
    };
    resetAutopilotPID();
    const controlsSlice = composeControlsSlice(pilotInputs);
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      aircraft,
      ...controlsSlice,
      inputManager: createInputManagerState({
        ...pilotInputs,
        stabilizerTrimUnits: aircraft.config.stabilizerTrimUnits,
      }),
      apState: null,
      apCommands: {},
      status: 'running',
      lastFrameTime: 0,
      fixedStepAccumulatorSeconds: 0,
      guidance: syncGuidanceState(s.guidance, scenario, 'running', aircraft, controlsSlice.effectiveControls),
    };
  }),

  pause: () => set((s) => {
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      status: 'paused',
      guidance: syncGuidanceState(s.guidance, scenario, 'paused', s.aircraft, s.effectiveControls),
    };
  }),
  resume: () => set((s) => {
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      status: 'running',
      lastFrameTime: 0,
      fixedStepAccumulatorSeconds: 0,
      guidance: syncGuidanceState(s.guidance, scenario, 'running', s.aircraft, s.effectiveControls),
    };
  }),
  reset: () => set((s) => {
    const scenario = scenarioById(s.selectedScenarioId);
    const pilotInputs = inputsForScenario(scenario);
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, scenario);
    const controlsSlice = composeControlsSlice(pilotInputs);
    resetAutopilotPID();
    return {
      aircraft,
      ...controlsSlice,
      inputManager: inputManagerForScenario(scenario),
      status: 'stopped',
      lastFrameTime: 0,
      fixedStepAccumulatorSeconds: 0,
      simulationTimeSeconds: 0,
      droppedSimulationTimeSeconds: 0,
      apState: null,
      flightPlan: null,
      activeLegIndex: null,
      routeStatus: createNoRouteStatus(),
      wind: cloneWind(scenario.wind),
      guidance: buildGuidanceState({
        scenario,
        status: 'stopped',
        aircraft,
        controls: controlsSlice.effectiveControls,
      }),
    };
  }),

  setScenario: (scenarioId) => set(() => {
    const scenario = scenarioById(scenarioId);
    const pilotInputs = inputsForScenario(scenario);
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, scenario);
    const controlsSlice = composeControlsSlice(pilotInputs);
    resetAutopilotPID();
    return {
      selectedScenarioId: scenario.id,
      aircraft,
      ...controlsSlice,
      inputManager: inputManagerForScenario(scenario),
      status: 'stopped',
      lastFrameTime: 0,
      fixedStepAccumulatorSeconds: 0,
      simulationTimeSeconds: 0,
      droppedSimulationTimeSeconds: 0,
      apState: null,
      flightPlan: null,
      activeLegIndex: null,
      routeStatus: createNoRouteStatus(),
      wind: cloneWind(scenario.wind),
      guidance: buildGuidanceState({
        scenario,
        status: 'stopped',
        aircraft,
        controls: controlsSlice.effectiveControls,
      }),
    };
  }),

  setTutorialStep: (stepIndex) => set((s) => {
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, s.effectiveControls, stepIndex),
    };
  }),

  setApState: (ap) => set((s) => {
    const modesChanged = autopilotModesChanged(s.apState, ap);
    if (modesChanged) resetAutopilotPID();
    const controlsSlice = composeControlsSlice(s.pilotInputs, modesChanged ? {} : s.apCommands, ap);
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      apState: ap,
      ...controlsSlice,
      guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, controlsSlice.effectiveControls),
    };
  }),
  setFlightPlan: (fp) => set((s) => {
    const activeLegIndex = getInitialActiveLegIndex(fp);
    return {
      flightPlan: fp,
      activeLegIndex,
      routeStatus: fp ? computeRouteStatus(s.aircraft, fp, activeLegIndex) : createNoRouteStatus(),
    };
  }),
  setWind: (w) => set({ wind: w }),

  saveScenarioState: (storage) => set((s) => {
    const targetStorage = storage ?? defaultScenarioStorage();
    if (!targetStorage) {
      return { scenarioPersistenceMessage: 'Scenario save unavailable: localStorage is not available.' };
    }

    try {
      saveScenarioSnapshot(targetStorage, createScenarioSnapshot(s));
      return { scenarioPersistenceMessage: 'Scenario state saved.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown storage error';
      return { scenarioPersistenceMessage: `Scenario save failed: ${message}` };
    }
  }),

  loadScenarioState: (storage) => set(() => {
    const targetStorage = storage ?? defaultScenarioStorage();
    if (!targetStorage) {
      return { scenarioPersistenceMessage: 'Ignored saved scenario: localStorage is not available.' };
    }

    const loaded = loadScenarioSnapshot(targetStorage);
    if (!loaded.ok) {
      return { scenarioPersistenceMessage: `Ignored saved scenario: ${loaded.reason}.` };
    }

    try {
      return restoreSnapshotSlice(loaded.snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'restore failed';
      return { scenarioPersistenceMessage: `Ignored saved scenario: ${message}.` };
    }
  }),
}));
