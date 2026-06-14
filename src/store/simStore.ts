import { create } from 'zustand';
import type { AircraftState, AutopilotCommands, ControlInputs, AircraftSpec } from '../sim/types';
import { B737_800_SPEC, normalizeAircraftConfig } from '../sim/types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../sim/weather';
import { ENVA_TUTORIAL_SCENARIO, createAircraftStateForScenario, scenarioById } from '../sim/scenarios';
import { buildGuidanceState, type GuidanceState } from '../sim/guidanceState';
import {
  composeControlsSlice,
  syncGuidanceState,
} from '../sim/simulationStep';
import { getSimulationRuntime } from '../sim/simulationRuntime';
import type { SimulationStatus } from '../sim/simulationStatus';
import {
  computeRouteStatus,
  createNoRouteStatus,
  getInitialActiveLegIndex,
  type RouteStatusSnapshot,
} from '../sim/systems/navigation';
import {
  createAutopilotControllerState,
  type AutopilotControllerState,
} from '../sim/systems/autopilot';
import {
  deriveEffectiveAutoflightTruth,
  effectiveAutopilotIsEngaged,
} from '../sim/systems/effectiveAutoflightTruth';
import {
  createInputManagerState,
  type InputActions,
  type InputManagerState,
} from '../input/InputManager';
import { resolveGearLeverCommand } from '../input/gearCommand';
import { isPositiveRateEstablished } from '../sim/flightPhasePredicates';
import {
  inputActionsIncludeManualApAxis,
  inputManagerForScenario,
  inputsForScenario,
  isRejectedTakeoffAbortLatched,
  normalizeControlInputs,
  reduceInputManagerActions,
  sanitizeSetInputPartial,
  syncInputManagerWithInputPartial,
} from './simStoreInputReducers';

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
  apControllerState: AutopilotControllerState;
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

function cloneWind(wind: WindInfo): WindInfo {
  return { ...wind };
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

type EffectiveTruthContext = Pick<SimStore, 'aircraft' | 'flightPlan' | 'routeStatus'>;

function effectiveTruthOwnsThrust(apState: AutopilotState | null, context: EffectiveTruthContext): boolean {
  const truth = deriveEffectiveAutoflightTruth(apState, context);
  return truth.thrustActive === 'SPEED' || truth.thrustActive === 'N1';
}

function apEffectivelyOwnsThrust(s: Pick<SimStore, 'apState' | 'aircraft' | 'flightPlan' | 'routeStatus'>): boolean {
  return effectiveTruthOwnsThrust(s.apState, s);
}

function apIsEffectivelyEngaged(s: Pick<SimStore, 'apState' | 'aircraft' | 'flightPlan' | 'routeStatus'>): boolean {
  return effectiveAutopilotIsEngaged(s.apState, s);
}

function withoutThrottleApCommands(apCommands: AutopilotCommands): AutopilotCommands {
  if (apCommands.throttle1 === undefined && apCommands.throttle2 === undefined) return apCommands;
  const commands = { ...apCommands };
  delete commands.throttle1;
  delete commands.throttle2;
  return commands;
}

function commandsForThrustOwnership(apCommands: AutopilotCommands, ownsThrust: boolean): AutopilotCommands {
  return ownsThrust ? apCommands : withoutThrottleApCommands(apCommands);
}

function gateGearLeverPatch(
  partial: Partial<ControlInputs>,
  currentGearLever: ControlInputs['gearLever'],
  aircraft: AircraftState,
): Partial<ControlInputs> {
  if (partial.gearLever === undefined) return partial;

  const gearCommand = resolveGearLeverCommand({
    current: currentGearLever,
    requested: partial.gearLever,
    positiveRate: isPositiveRateEstablished(aircraft),
  });
  if (gearCommand.gearLever === currentGearLever) {
    const rest = { ...partial };
    delete rest.gearLever;
    return rest;
  }

  return { ...partial, gearLever: gearCommand.gearLever };
}

function disconnectAutopilot(apState: AutopilotState | null): AutopilotState | null {
  if (!apState) return null;
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
    n1: false,
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

const initialPilotInputs = inputsForScenario(ENVA_TUTORIAL_SCENARIO);
const initialControls = composeControlsSlice(initialPilotInputs);
const initialAircraft = createAircraftStateForScenario(B737_800_SPEC, ENVA_TUTORIAL_SCENARIO);
const initialGuidance = buildGuidanceState({
  scenario: ENVA_TUTORIAL_SCENARIO,
  status: 'stopped',
  aircraft: initialAircraft,
  controls: initialControls.effectiveControls,
});
const initialRouteStatus = createNoRouteStatus();
const initialAutopilotControllerState = createAutopilotControllerState();

function defaultScenarioStorage(): ScenarioPersistenceStorage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

function restoreSnapshotSlice(snapshot: ScenarioSnapshot): Partial<SimStore> {
  const aircraft = structuredClone(snapshot.aircraft);
  aircraft.config = normalizeAircraftConfig(aircraft.config);
  const apState = structuredClone(snapshot.apState);
  const apControllerState = structuredClone(snapshot.apControllerState ?? createAutopilotControllerState());
  const apCommands = structuredClone(snapshot.apCommands);
  const pilotInputs = normalizeControlInputs(structuredClone(snapshot.pilotInputs));
  const flightPlan = structuredClone(snapshot.flightPlan);
  const activeLegIndex = snapshot.activeLegIndex;
  const routeStatus = flightPlan ? computeRouteStatus(aircraft, flightPlan, activeLegIndex) : createNoRouteStatus();
  const controlsSlice = composeControlsSlice(pilotInputs, apCommands, apState, { aircraft, flightPlan, routeStatus });
  const scenario = scenarioById(snapshot.selectedScenarioId);
  const restoredStatus: SimStatus = snapshot.status === 'running' ? 'paused' : snapshot.status;
  const scenarioPersistenceMessage = snapshot.status === 'running'
    ? 'Saved scenario loaded paused.'
    : 'Saved scenario loaded.';

  return {
    selectedScenarioId: scenario.id,
    aircraft,
    ...controlsSlice,
    inputManager: createInputManagerState({
      ...structuredClone(snapshot.inputManager),
      leftBrake: 0,
      rightBrake: 0,
    }),
    status: restoredStatus,
    lastFrameTime: 0,
    fixedStepAccumulatorSeconds: 0,
    simulationTimeSeconds: snapshot.simulationTimeSeconds,
    droppedSimulationTimeSeconds: 0,
    apState,
    apControllerState,
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
  inputManager: inputManagerForScenario(ENVA_TUTORIAL_SCENARIO),
  spec: B737_800_SPEC,
  status: 'stopped',
  lastFrameTime: 0,
  fixedStepAccumulatorSeconds: 0,
  simulationTimeSeconds: 0,
  droppedSimulationTimeSeconds: 0,
  apState: null,
  apControllerState: initialAutopilotControllerState,
  flightPlan: null,
  activeLegIndex: null,
  routeStatus: initialRouteStatus,
  wind: cloneWind(ENVA_TUTORIAL_SCENARIO.wind),
  selectedScenarioId: ENVA_TUTORIAL_SCENARIO.id,
  guidance: initialGuidance,
  scenarioPersistenceMessage: null,

  setInput: (partial) =>
    set((s) => {
      const apActive = apIsEffectivelyEngaged(s);
      const apOwnsThrust = apEffectivelyOwnsThrust(s);
      const gatedPartial = gateGearLeverPatch(partial, s.pilotInputs.gearLever, s.aircraft);
      const { pilotPatch, shouldDisconnect } = sanitizeSetInputPartial(
        gatedPartial,
        s.pilotInputs,
        s.effectiveControls,
        apActive,
        apOwnsThrust,
      );
      const pilotInputs = { ...s.pilotInputs, ...pilotPatch };
      const apState = shouldDisconnect ? disconnectAutopilot(s.apState) : s.apState;
      const apControllerState = shouldDisconnect ? createAutopilotControllerState() : s.apControllerState;
      const apCommands = shouldDisconnect ? {} : commandsForThrustOwnership(s.apCommands, apOwnsThrust);
      const controlsSlice = composeControlsSlice(pilotInputs, apCommands, apState, s);
      const scenario = scenarioById(s.selectedScenarioId);
      return {
        ...controlsSlice,
        apState,
        apControllerState,
        inputManager: syncInputManagerWithInputPartial(s.inputManager, pilotPatch),
        guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, controlsSlice.effectiveControls),
      };
    }),

  applyInputActions: (actions, dt) =>
    set((s) => {
      let { inputManager, inputPatch } = reduceInputManagerActions({
        inputManager: s.inputManager,
        pilotInputs: s.pilotInputs,
        actions,
        dt,
      });
      const rejectedTakeoffAbort = isRejectedTakeoffAbortLatched(s.status, s.aircraft, s.pilotInputs);
      if (rejectedTakeoffAbort) {
        inputPatch = {
          ...inputPatch,
          throttle1: 0,
          throttle2: 0,
          brake: 1,
          spoilers: 1,
        };
      }

      const apOwnsThrust = apEffectivelyOwnsThrust(s);
      const apActive = apIsEffectivelyEngaged(s);
      if (!rejectedTakeoffAbort && apOwnsThrust && (inputPatch.throttle1 !== undefined || inputPatch.throttle2 !== undefined)) {
        inputPatch = { ...inputPatch };
        delete inputPatch.throttle1;
        delete inputPatch.throttle2;
        inputManager = createInputManagerState({
          ...inputManager,
          throttle: Math.max(s.pilotInputs.throttle1, s.pilotInputs.throttle2),
        });
      }
      inputPatch = gateGearLeverPatch(inputPatch, s.pilotInputs.gearLever, s.aircraft);

      const trimChanged = inputManager.stabilizerTrimUnits !== s.aircraft.config.stabilizerTrimUnits;
      const aircraft = trimChanged ? structuredClone(s.aircraft) : s.aircraft;
      if (trimChanged) {
        aircraft.config.stabilizerTrimUnits = inputManager.stabilizerTrimUnits;
      }

      const pilotInputs = Object.keys(inputPatch).length > 0 ? { ...s.pilotInputs, ...inputPatch } : s.pilotInputs;
      const shouldDisconnect = inputActionsIncludeManualApAxis(actions, apActive);
      const apState = shouldDisconnect ? disconnectAutopilot(s.apState) : s.apState;
      const apControllerState = shouldDisconnect ? createAutopilotControllerState() : s.apControllerState;
      const apCommands = shouldDisconnect ? {} : commandsForThrustOwnership(s.apCommands, apOwnsThrust);
      const controlsSlice = composeControlsSlice(pilotInputs, apCommands, apState, { ...s, aircraft });
      const scenario = scenarioById(s.selectedScenarioId);

      return {
        ...controlsSlice,
        inputManager,
        aircraft,
        apState,
        apControllerState,
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
      apControllerState,
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

    let nextAircraft = structuredClone(aircraft);
    let nextActiveLegIndex = activeLegIndex;
    let nextRouteStatus = routeStatus;
    let nextGuidance = guidance;
    let nextApControllerState = apControllerState;
    let nextControls = composeControlsSlice(pilotInputs, get().apCommands, apState, {
      aircraft: nextAircraft,
      flightPlan,
      routeStatus: nextRouteStatus,
    });
    const simulationRuntime = getSimulationRuntime();

    for (let step = 0; step < stepCount; step++) {
      const next = simulationRuntime.step({
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
        apControllerState: nextApControllerState,
        cloneAircraft: false,
      });
      nextAircraft = next.aircraft;
      nextControls = next.controls;
      nextActiveLegIndex = next.activeLegIndex;
      nextRouteStatus = next.routeStatus;
      nextGuidance = next.guidance;
      nextApControllerState = next.apControllerState;
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
      apControllerState: nextApControllerState,
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
    // Reset to zero: pilot sets their own throttle, flaps, and trim for takeoff.
    aircraft.config.flapSetting = 0;
    aircraft.config.stabilizerTrimUnits = 0;
    const pilotInputs: ControlInputs = {
      ...s.pilotInputs,
      throttle1: 0,
      throttle2: 0,
      flapLever: 0,
      gearLever: 'DOWN',
      brake: 0,
      leftBrake: 0,
      rightBrake: 0,
      elevator: 0,
    };
    const apControllerState = createAutopilotControllerState();
    const controlsSlice = composeControlsSlice(pilotInputs);
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      aircraft,
      ...controlsSlice,
      inputManager: createInputManagerState({
        ...pilotInputs,
        stabilizerTrimUnits: 0,
      }),
      apState: null,
      apControllerState,
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
      leftBrake: 0,
      rightBrake: 0,
      spoilers: 1,
      elevator: 0,
      gearLever: 'DOWN',
    };
    const apControllerState = createAutopilotControllerState();
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
      apControllerState,
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
    const apControllerState = createAutopilotControllerState();
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
      apControllerState,
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
    const apControllerState = createAutopilotControllerState();
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
      apControllerState,
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
    const apControllerState = modesChanged ? createAutopilotControllerState() : s.apControllerState;
    const nextOwnsThrust = effectiveTruthOwnsThrust(ap, s);
    const apCommands = modesChanged ? {} : commandsForThrustOwnership(s.apCommands, nextOwnsThrust);
    const controlsSlice = composeControlsSlice(s.pilotInputs, apCommands, ap, s);
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      apState: ap,
      apControllerState,
      ...controlsSlice,
      guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, controlsSlice.effectiveControls),
    };
  }),
  setFlightPlan: (fp) => set((s) => {
    const activeLegIndex = getInitialActiveLegIndex(fp);
    const routeStatus = fp ? computeRouteStatus(s.aircraft, fp, activeLegIndex) : createNoRouteStatus();
    const controlsSlice = composeControlsSlice(s.pilotInputs, s.apCommands, s.apState, {
      aircraft: s.aircraft,
      flightPlan: fp,
      routeStatus,
    });
    const scenario = scenarioById(s.selectedScenarioId);
    return {
      flightPlan: fp,
      activeLegIndex,
      routeStatus,
      ...controlsSlice,
      guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, controlsSlice.effectiveControls),
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
