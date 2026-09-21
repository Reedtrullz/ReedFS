import { create } from 'zustand';
import type { AircraftState, AutopilotCommands, ControlInputs, AircraftSpec } from '../sim/types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../sim/weather';
import type { ScenarioWeatherMetadata } from '../sim/weather';
import type { RunwayReference } from '../viewport/runwayData';
import type { GuidanceState } from '../sim/guidanceState';
import type { RouteEditSession } from '../sim/fms/routeAdapter';
import { composeControlsSlice, type SimulationStepResult } from '../sim/simulationStep';
import { getSimulationRuntime, type AsyncSimulationRuntime } from '../sim/simulationRuntime';
import type { SimulationStatus } from '../sim/simulationStatus';
import type { RouteStatusSnapshot } from '../sim/systems/navigation';
import type { AutopilotControllerState } from '../sim/systems/autopilot';
import type { InputActions, InputManagerState } from '../input/InputManager';

import type {
  ScenarioPersistenceStorage,
  ScenarioSaveOptions,
  ScenarioSaveSlotMetadata,
} from './scenarioPersistence';
import { createAircraftSlice, type SimStoreSet } from './slices/aircraftSlice';
import { createInputSlice } from './slices/inputSlice';
import { createAutoflightSlice } from './slices/autoflightSlice';
import { createRouteSlice } from './slices/routeSlice';
import { createPersistenceSlice } from './slices/persistenceSlice';

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
  simRate: number;
  apState: AutopilotState | null;
  apControllerState: AutopilotControllerState;
  flightPlan: FlightPlan | null;
  activeLegIndex: number | null;
  routeStatus: RouteStatusSnapshot;
  /** RFMS-backed staged route edits; draft stays inert until EXEC. */
  routeEditSession: RouteEditSession | null;
  routeEditMessage: string | null;
  wind: WindInfo | null;
  /** Live weather (scenario seed updated by METAR QNH/temperature) fed to physics. */
  weather: ScenarioWeatherMetadata | null;
  /** Bumped whenever aircraft state is replaced or the loop is paused/reset; in-flight async physics batches with an older generation are discarded. */
  asyncPhysicsGeneration: number;
  /** True while one worker physics batch is awaited by the async frame bridge. */
  asyncPhysicsInFlight: boolean;
  selectedScenarioId: string;
  guidance: GuidanceState;
  controlFeedbackMessage: string | null;
  scenarioPersistenceMessage: string | null;
  scenarioSaveSlots: ScenarioSaveSlotMetadata[];
  setInput: (partial: Partial<ControlInputs>) => void;
  setTakeoffConfig: () => void;
  applyInputActions: (actions: InputActions, dt: number) => void;
  tick: (timestamp: number) => void;
  /**
   * Async-aware frame-bridge entry point. Dispatches fixed-step batches through
   * runtime.stepAsync when the active runtime supports it, reserving frame timing
   * immediately so render/audio phases never block on worker latency. Falls back
   * to the synchronous tick when no async runtime is active.
   */
  tickAsync: (timestamp: number) => void;
  cycleSimRate: () => void;
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
  setFlightPlanAtRunway: (fp: FlightPlan, originRunway: RunwayReference) => void;
  stageDirectTo: (ident: string) => void;
  stageInsertDiscontinuity: (afterIndex: number) => void;
  undoRouteEditOperation: () => void;
  executeRouteEdit: () => void;
  setWind: (w: WindInfo | null) => void;
  setWeather: (w: ScenarioWeatherMetadata | null) => void;
  saveScenarioState: (storage?: ScenarioPersistenceStorage, options?: ScenarioSaveOptions) => void;
  loadScenarioState: (storage?: ScenarioPersistenceStorage, slotId?: string) => void;
  refreshScenarioSaveSlots: (storage?: ScenarioPersistenceStorage) => void;
}

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 16;
const MAX_ACCELERATED_FRAME_SECONDS = 1;
const SIM_RATES = [1, 4, 16, 64] as const;
type SimRate = typeof SIM_RATES[number];

function nextSimRate(current: number): SimRate {
  const currentIndex = SIM_RATES.findIndex((rate) => rate === current);
  return SIM_RATES[(currentIndex + 1) % SIM_RATES.length];
}

function maxStepsPerRenderedFrame(simRate: number): number {
  if (simRate <= 1) return MAX_STEPS_PER_FRAME;
  return Math.max(MAX_STEPS_PER_FRAME, Math.ceil(MAX_ACCELERATED_FRAME_SECONDS * Math.max(1, simRate) / FIXED_STEP_SECONDS));
}

export const useSimStore = create<SimStore>((set, get) => {
  const storeSet = set as SimStoreSet;

  return {
    ...createAircraftSlice(storeSet),
    ...createInputSlice(storeSet),
    simRate: 1,
    cycleSimRate: () => set((state) => ({ simRate: nextSimRate(state.simRate) })),

    tick: (timestamp: number) => {
      const {
        weather,
        status,
        lastFrameTime,
        fixedStepAccumulatorSeconds,
        simulationTimeSeconds,
        droppedSimulationTimeSeconds,
        simRate,
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
      const scaledFrameDeltaSeconds = frameDeltaSeconds * Math.max(1, simRate);
      let accumulator = fixedStepAccumulatorSeconds + scaledFrameDeltaSeconds;
      let stepCount = Math.floor(accumulator / FIXED_STEP_SECONDS);
      let droppedTime = droppedSimulationTimeSeconds;

      const maxStepsThisFrame = maxStepsPerRenderedFrame(simRate);

      if (stepCount > maxStepsThisFrame) {
        const executableTime = maxStepsThisFrame * FIXED_STEP_SECONDS;
        droppedTime += accumulator - executableTime;
        accumulator = executableTime;
        stepCount = maxStepsThisFrame;
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
          weather,
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

    tickAsync: (timestamp) => {
      const runtime = getSimulationRuntime();
      const asyncRuntime: AsyncSimulationRuntime | null =
        'stepAsync' in runtime && typeof runtime.stepAsync === 'function' ? runtime as AsyncSimulationRuntime : null;
      if (!asyncRuntime) {
        get().tick(timestamp);
        return;
      }

      const state = get();
      if (state.status !== 'running') return;
      if (state.asyncPhysicsInFlight) {
        // Frames arriving while a batch is in flight must bank their wall
        // time into the accumulator; resetting lastFrameTime here would
        // silently drop real time between dispatches and run the sim slow.
        const skippedDelta = state.lastFrameTime > 0
          ? Math.max(0, (timestamp - state.lastFrameTime) / 1000)
          : 0;
        set({
          lastFrameTime: timestamp,
          fixedStepAccumulatorSeconds: state.fixedStepAccumulatorSeconds + skippedDelta * Math.max(1, state.simRate),
        });
        return;
      }

      const frameDeltaSeconds = state.lastFrameTime > 0
        ? Math.max(0, (timestamp - state.lastFrameTime) / 1000)
        : FIXED_STEP_SECONDS;
      const scaledFrameDeltaSeconds = frameDeltaSeconds * Math.max(1, state.simRate);
      let accumulator = state.fixedStepAccumulatorSeconds + scaledFrameDeltaSeconds;
      const maxStepsThisFrame = maxStepsPerRenderedFrame(state.simRate);
      let droppedTime = state.droppedSimulationTimeSeconds;
      let stepCount = Math.floor(accumulator / FIXED_STEP_SECONDS);
      if (stepCount > maxStepsThisFrame) {
        const executableTime = maxStepsThisFrame * FIXED_STEP_SECONDS;
        droppedTime += accumulator - executableTime;
        accumulator = executableTime;
        stepCount = maxStepsThisFrame;
      }

      if (stepCount <= 0) {
        set({ lastFrameTime: timestamp, fixedStepAccumulatorSeconds: accumulator, droppedSimulationTimeSeconds: droppedTime });
        return;
      }

      const generation = state.asyncPhysicsGeneration;
      const {
        aircraft,
        spec,
      pilotInputs,
      apState,
      flightPlan,
        activeLegIndex,
        routeStatus,
        wind,
        weather,
        selectedScenarioId,
        guidance,
        apControllerState,
      } = state;
      let nextAircraft = structuredClone(aircraft);
      let nextActiveLegIndex = activeLegIndex;
      let nextRouteStatus = routeStatus;
      let nextGuidance = guidance;
      let nextApControllerState = apControllerState;
      let remainingSteps = stepCount;

      const committedSteps = () => stepCount - remainingSteps;

      const applyBatch = (result: SimulationStepResult) => {
        if (get().asyncPhysicsGeneration !== generation) return;
        accumulator -= (stepCount - remainingSteps) * FIXED_STEP_SECONDS;
        if (Math.abs(accumulator) < 1e-12) accumulator = 0;
        // Inputs may change while a batch is in flight. Physics echoes the
        // dispatch-time pilot inputs back in result.controls, so committing
        // them verbatim would revert any lever moved mid-batch. Pilot-owned
        // axes stay authoritative from the live store; AP commands still come
        // from physics because only it integrates autopilot servo state.
        const current = get();
        const pilotInputs = current.pilotInputs;
        const controls = composeControlsSlice(pilotInputs, result.apCommands, apState, {
          aircraft: result.aircraft,
          flightPlan,
          routeStatus: result.routeStatus,
        });
        set({
          aircraft: result.aircraft,
          lastFrameTime: timestamp,
          fixedStepAccumulatorSeconds: accumulator,
          simulationTimeSeconds: state.simulationTimeSeconds + committedSteps() * FIXED_STEP_SECONDS,
          droppedSimulationTimeSeconds: droppedTime,
          pilotInputs,
          apCommands: controls.apCommands,
          effectiveControls: controls.effectiveControls,
          inputs: controls.effectiveControls,
          apControllerState: result.apControllerState,
          activeLegIndex: result.activeLegIndex,
          routeStatus: result.routeStatus,
          guidance: result.guidance,
          asyncPhysicsInFlight: false,
        });
      };

      const runBatch = (): Promise<void> => {
        if (remainingSteps <= 0) return Promise.resolve();
        const batchSteps = remainingSteps;
        const input = {
          aircraft: nextAircraft,
          spec,
          pilotInputs,
          apState,
          flightPlan,
          activeLegIndex: nextActiveLegIndex,
          routeStatus: nextRouteStatus,
          wind,
          weather,
          dt: FIXED_STEP_SECONDS,
          status: state.status,
          selectedScenarioId,
          guidance: nextGuidance,
          apControllerState: nextApControllerState,
          cloneAircraft: false,
          steps: batchSteps,
        };
        return asyncRuntime.stepAsync(input).then((result) => {
          if (get().asyncPhysicsGeneration !== generation) return;
          nextAircraft = result.aircraft;
          nextActiveLegIndex = result.activeLegIndex;
          nextRouteStatus = result.routeStatus;
          nextGuidance = result.guidance;
          nextApControllerState = result.apControllerState;
          remainingSteps = 0;
          applyBatch(result);
        });
      };

      set({ asyncPhysicsInFlight: true });
      runBatch().catch(() => {
        if (get().asyncPhysicsGeneration !== generation) return;
        set({ asyncPhysicsInFlight: false });
      });
    },

    ...createAutoflightSlice(storeSet),
    ...createRouteSlice(storeSet),
    ...createPersistenceSlice(storeSet),
  };
});
