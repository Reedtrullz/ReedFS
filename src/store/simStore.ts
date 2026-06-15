import { create } from 'zustand';
import type { AircraftState, AutopilotCommands, ControlInputs, AircraftSpec } from '../sim/types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../sim/weather';
import type { GuidanceState } from '../sim/guidanceState';
import { composeControlsSlice } from '../sim/simulationStep';
import { getSimulationRuntime } from '../sim/simulationRuntime';
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
  wind: WindInfo | null;
  selectedScenarioId: string;
  guidance: GuidanceState;
  scenarioPersistenceMessage: string | null;
  scenarioSaveSlots: ScenarioSaveSlotMetadata[];
  setInput: (partial: Partial<ControlInputs>) => void;
  setTakeoffConfig: () => void;
  applyInputActions: (actions: InputActions, dt: number) => void;
  tick: (timestamp: number) => void;
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
  setWind: (w: WindInfo | null) => void;
  saveScenarioState: (storage?: ScenarioPersistenceStorage, options?: ScenarioSaveOptions) => void;
  loadScenarioState: (storage?: ScenarioPersistenceStorage, slotId?: string) => void;
  refreshScenarioSaveSlots: (storage?: ScenarioPersistenceStorage) => void;
}

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 16;
const SIM_RATES = [1, 4, 16] as const;
type SimRate = typeof SIM_RATES[number];

function nextSimRate(current: number): SimRate {
  const currentIndex = SIM_RATES.findIndex((rate) => rate === current);
  return SIM_RATES[(currentIndex + 1) % SIM_RATES.length];
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

    ...createAutoflightSlice(storeSet),
    ...createRouteSlice(storeSet),
    ...createPersistenceSlice(storeSet),
  };
});
