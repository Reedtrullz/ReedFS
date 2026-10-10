import { create } from 'zustand';
import type { AircraftState, AutopilotCommands, ControlInputs, AircraftSpec } from '../sim/types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../sim/weather';
import type { ScenarioWeatherMetadata } from '../sim/weather';
import type { RunwayOverrides, RunwayReference } from '../viewport/runwayData';
import type { GuidanceState } from '../sim/guidanceState';
import type { RouteEditSession } from '../sim/fms/routeAdapter';
import { composeControlsSlice, type SimulationStepInput } from '../sim/simulationStep';
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
import { createPersistenceSlice, restoreSnapshotSlice } from './slices/persistenceSlice';
import { captureScenarioSnapshot, type ScenarioSnapshot } from './scenarioPersistence';
import type { LevelEquilibriumReceipt } from './levelEquilibrium';
import { assertCommittedSimulationResult, assertSimulationStepInput, InvalidSimulationStateError } from '../sim/simulationValidation';

import { appliedCommandLatency, commandBoundaryPatch, commitRate, type CommandRevisions, type SimulationCommit } from './commandBoundaries';

export type SimStatus = SimulationStatus;

export interface SimulationFailureEvidence {
  message: string;
  detectedAtIso: string;
  input: unknown;
  result: unknown;
  recovered: boolean;
  checkpoint: ScenarioSnapshot | null;
}

export interface SimStore {
  commandRevisions: CommandRevisions;
  commandAcceptedAtMs: number;
  simulationCommit: SimulationCommit | null;
  asyncReservedSteps: number;
  simulationFailure: SimulationFailureEvidence | null;
  lastValidCheckpoint: ScenarioSnapshot | null;
  restoreLastValidCheckpoint: () => void;
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
  /** Shared authoritative runway editor overrides consumed by rendering and physics. */
  runwayOverrides: RunwayOverrides | null;
  /** A scenario/reset/restore epoch fences asynchronous weather requests. */
  weatherEpoch: number;
  /** Saved conditions remain authoritative until reset or scenario selection. */
  weatherRestored: boolean;
  /** Bumped whenever aircraft state is replaced or the loop is paused/reset; in-flight async physics batches with an older generation are discarded. */
  asyncPhysicsGeneration: number;
  /** True while one worker physics batch is awaited by the async frame bridge. */
  asyncPhysicsInFlight: boolean;
  selectedScenarioId: string;
  guidance: GuidanceState;
  controlFeedbackMessage: string | null;
  /** Solver receipt for the active scenario when it declares a level-equilibrium target. */
  levelEquilibriumReceipt: LevelEquilibriumReceipt | null;
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
  setScenarioUtc: (utc: string) => boolean;
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
  setRunwayOverrides: (overrides: RunwayOverrides | null) => void;
  setWeather: (w: ScenarioWeatherMetadata | null) => void;
  pendingScenarioSave: ScenarioSnapshot | null;
  discardPendingScenarioSave: () => void;
  deleteScenarioSaveState: (slotId: string, expectedRevision: string) => void;
  saveScenarioState: (storage?: ScenarioPersistenceStorage, options?: ScenarioSaveOptions) => Promise<boolean>;
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
  return Math.min(128, Math.max(MAX_STEPS_PER_FRAME, Math.ceil(MAX_ACCELERATED_FRAME_SECONDS * Math.max(1, simRate) / FIXED_STEP_SECONDS)));
}

export const useSimStore = create<SimStore>((set, get) => {
  const storeSet: SimStoreSet = (partial, options) => set((state) => commandBoundaryPatch(state, typeof partial === 'function' ? partial(state) : partial, options?.trimIntentOnly));
  const containFailure = (error: unknown, input: unknown, result: unknown) => {
    const current = get();
    const checkpoint = current.lastValidCheckpoint ? structuredClone(current.lastValidCheckpoint) : null;
    set({
      lastValidCheckpoint: checkpoint,
      status: 'paused', asyncPhysicsInFlight: false, asyncReservedSteps: 0,
      asyncPhysicsGeneration: current.asyncPhysicsGeneration + 1,
      fixedStepAccumulatorSeconds: 0, lastFrameTime: 0,
      simulationFailure: {
        message: error instanceof Error ? error.message : 'Simulation failed',
        detectedAtIso: new Date().toISOString(), input: structuredClone(input),
        result: error instanceof InvalidSimulationStateError ? error.result : result,
        recovered: false, checkpoint,
      },
    });
  };

  return {
    commandRevisions: { pilot: 0, autoflight: 0, route: 0, environment: 0 },
    commandAcceptedAtMs: 0, simulationCommit: null, asyncReservedSteps: 0,
    runwayOverrides: null,
    ...createAircraftSlice(storeSet),
    ...createInputSlice(storeSet),
    simulationFailure: null,
    lastValidCheckpoint: null,
    restoreLastValidCheckpoint: () => {
      const current = get();
      if (!current.lastValidCheckpoint) return;
      storeSet({
        ...restoreSnapshotSlice(current.lastValidCheckpoint, 'Last valid checkpoint'),
        weatherEpoch: current.weatherEpoch + 1,
        status: 'paused', asyncPhysicsInFlight: false,
        asyncPhysicsGeneration: current.asyncPhysicsGeneration + 1,
        simulationFailure: current.simulationFailure ? { ...current.simulationFailure, recovered: true } : null,
      });
    },
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
        runwayOverrides,
        selectedScenarioId,
        guidance,
      } = get();
      if (status !== 'running' || (get().simulationFailure && !get().simulationFailure?.recovered)) return;

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

      const boundaryState = get();
      const startedAt = performance.now();
      let nextAircraft = structuredClone(aircraft);
      let nextActiveLegIndex = activeLegIndex;
      let nextRouteStatus = routeStatus;
      let nextGuidance = guidance;
      let nextApControllerState = apControllerState;
      let nextControls: ReturnType<typeof composeControlsSlice>;
      const simulationRuntime = getSimulationRuntime();

      const checkpoint = captureScenarioSnapshot(get());
      let diagnosticInput: unknown;
      let diagnosticResult: unknown;
      try {
        const input: SimulationStepInput = {
          aircraft: nextAircraft,
          spec,
          pilotInputs,
          apState,
          flightPlan,
          activeLegIndex: nextActiveLegIndex,
          routeStatus: nextRouteStatus,
          wind,
          weather,
          runwayOverrides,
          dt: FIXED_STEP_SECONDS,
          status,
          selectedScenarioId,
          guidance: nextGuidance,
          apControllerState: nextApControllerState,
          cloneAircraft: false,
          steps: stepCount,
        };
        diagnosticInput = { ...input, aircraft: checkpoint.aircraft, pilotInputs: checkpoint.pilotInputs, apControllerState: checkpoint.apControllerState, apState: checkpoint.apState, flightPlan: checkpoint.flightPlan, weather: checkpoint.weather, wind: checkpoint.wind };
        assertSimulationStepInput(input);
        set({ lastValidCheckpoint: checkpoint });
        const next = simulationRuntime.step(input);
        diagnosticResult = next;
        assertCommittedSimulationResult(next, selectedScenarioId);
        nextAircraft = next.aircraft;
        nextControls = next.controls;
        nextActiveLegIndex = next.activeLegIndex;
        nextRouteStatus = next.routeStatus;
        nextGuidance = next.guidance;
        nextApControllerState = next.apControllerState;
      } catch (error) {
        containFailure(error, diagnosticInput, diagnosticResult);
        return;
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
        simulationCommit: {
          ...commitRate(boundaryState.simulationCommit, performance.now(), simulationTimeSeconds + stepCount * FIXED_STEP_SECONDS),
          stepIndex: (boundaryState.simulationCommit?.stepIndex ?? Math.round(simulationTimeSeconds / FIXED_STEP_SECONDS)) + stepCount,
          revisions: boundaryState.commandRevisions, committedAtMs: performance.now(), batchSteps: stepCount,
          batchDurationMs: performance.now() - startedAt,
          commandLatencyMs: appliedCommandLatency(boundaryState, performance.now()),
          observation: { aircraft: nextAircraft, apState, flightPlan, routeStatus: nextRouteStatus, wind, weather, guidance: nextGuidance, apCommands: nextControls.apCommands },
        },
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
      if (state.status !== 'running' || (state.simulationFailure && !state.simulationFailure.recovered)) return;
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
      let remainingSteps = stepCount;
      // Reserve only this frame's bounded work. Frames arriving during a worker
      // turn bank new time independently; a commit never overwrites that bank.
      accumulator -= stepCount * FIXED_STEP_SECONDS;
      if (Math.abs(accumulator) < 1e-12) accumulator = 0;
      set({ asyncPhysicsInFlight: true, asyncReservedSteps: remainingSteps,
        lastFrameTime: timestamp, fixedStepAccumulatorSeconds: accumulator, droppedSimulationTimeSeconds: droppedTime });

      let diagnosticInput: unknown;
      let diagnosticResult: unknown;
      const runBatch = async (): Promise<void> => {
        while (remainingSteps > 0) {
          // Commands accepted before dispatch belong to this boundary.
          await Promise.resolve();
          if (get().asyncPhysicsGeneration !== generation) return;
          const current = get();
          const batchSteps = Math.min(16, remainingSteps);
          const checkpoint = captureScenarioSnapshot(current);
          const input: SimulationStepInput = {
            aircraft: current.aircraft, spec: current.spec, pilotInputs: current.pilotInputs,
            apState: current.apState, flightPlan: current.flightPlan, activeLegIndex: current.activeLegIndex,
            routeStatus: current.routeStatus, wind: current.wind, weather: current.weather,
            runwayOverrides: current.runwayOverrides,
            dt: FIXED_STEP_SECONDS, status: current.status, selectedScenarioId: current.selectedScenarioId,
            guidance: current.guidance, apControllerState: current.apControllerState,
            cloneAircraft: true, steps: batchSteps,
          };
          diagnosticInput = { ...input, aircraft: checkpoint.aircraft };
          assertSimulationStepInput(input);
          set({ lastValidCheckpoint: checkpoint });
          const startedAt = performance.now();
          const result = await asyncRuntime.stepAsync(input);
          if (get().asyncPhysicsGeneration !== generation) return;
          diagnosticResult = result;
          assertCommittedSimulationResult(result, current.selectedScenarioId);
          remainingSteps -= batchSteps;
          const live = get();
          const controls = composeControlsSlice(live.pilotInputs, result.apCommands, current.apState, {
            aircraft: result.aircraft, flightPlan: current.flightPlan, routeStatus: result.routeStatus,
          });
          const committedAtMs = performance.now();
          // Trim intent, like live pilot levers, must not be replaced by an old
          // echo. The observation below retains the trim actually simulated.
          const aircraft = live.inputManager.stabilizerTrimUnits === result.aircraft.config.stabilizerTrimUnits
            ? result.aircraft : { ...result.aircraft, config: { ...result.aircraft.config, stabilizerTrimUnits: live.inputManager.stabilizerTrimUnits } };
          set({
            aircraft, simulationTimeSeconds: live.simulationTimeSeconds + batchSteps * FIXED_STEP_SECONDS,
            pilotInputs: live.pilotInputs, apCommands: controls.apCommands, effectiveControls: controls.effectiveControls, inputs: controls.effectiveControls,
            apControllerState: result.apControllerState, activeLegIndex: result.activeLegIndex, routeStatus: result.routeStatus, guidance: result.guidance,
            asyncPhysicsInFlight: remainingSteps > 0, asyncReservedSteps: remainingSteps,
            simulationCommit: {
              ...commitRate(live.simulationCommit, committedAtMs, live.simulationTimeSeconds + batchSteps * FIXED_STEP_SECONDS),
              stepIndex: (live.simulationCommit?.stepIndex ?? Math.round(live.simulationTimeSeconds / FIXED_STEP_SECONDS)) + batchSteps,
              revisions: current.commandRevisions, committedAtMs, batchSteps, batchDurationMs: committedAtMs - startedAt,
              commandLatencyMs: appliedCommandLatency(current, committedAtMs),
              observation: { aircraft: result.aircraft, apState: current.apState, flightPlan: current.flightPlan, routeStatus: result.routeStatus,
                wind: current.wind, weather: current.weather, guidance: result.guidance, apCommands: result.apCommands },
            },
          });
        }
      };
      runBatch().catch((error) => {
        if (get().asyncPhysicsGeneration !== generation) return;
        containFailure(error, diagnosticInput, diagnosticResult);
      });
    },

    ...createAutoflightSlice(storeSet),
    ...createRouteSlice(storeSet),
    ...createPersistenceSlice(storeSet, get),
  };
});
