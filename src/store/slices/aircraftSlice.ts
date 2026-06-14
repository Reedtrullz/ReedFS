import type { ControlInputs } from '../../sim/types';
import { B737_800_SPEC } from '../../sim/types';
import { ENVA_TUTORIAL_SCENARIO, createAircraftStateForScenario, scenarioById } from '../../sim/scenarios';
import { buildGuidanceState } from '../../sim/guidanceState';
import { composeControlsSlice, syncGuidanceState } from '../../sim/simulationStep';
import { createNoRouteStatus } from '../../sim/systems/navigation';
import { createAutopilotControllerState } from '../../sim/systems/autopilot';
import { createInputManagerState } from '../../input/InputManager';
import type { WindInfo } from '../../sim/weather';
import type { SimStore } from '../simStore';
import {
  inputManagerForScenario,
  inputsForScenario,
} from '../simStoreInputReducers';

export type SimStoreSet = (partial: Partial<SimStore> | ((state: SimStore) => Partial<SimStore>)) => void;

export function cloneWind(wind: WindInfo): WindInfo {
  return { ...wind };
}

export function createAircraftSlice(set: SimStoreSet): Pick<
  SimStore,
  | 'aircraft'
  | 'inputs'
  | 'pilotInputs'
  | 'apCommands'
  | 'effectiveControls'
  | 'inputManager'
  | 'spec'
  | 'status'
  | 'lastFrameTime'
  | 'fixedStepAccumulatorSeconds'
  | 'simulationTimeSeconds'
  | 'droppedSimulationTimeSeconds'
  | 'apState'
  | 'apControllerState'
  | 'flightPlan'
  | 'activeLegIndex'
  | 'routeStatus'
  | 'wind'
  | 'selectedScenarioId'
  | 'guidance'
  | 'scenarioPersistenceMessage'
  | 'scenarioSaveSlots'
  | 'start'
  | 'startTakeoffRoll'
  | 'abortTakeoff'
  | 'pause'
  | 'resume'
  | 'reset'
  | 'setScenario'
  | 'setTutorialStep'
> {
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

  return {
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
    scenarioSaveSlots: [],

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
          stabilizerTrimUnits: aircraft.config.stabilizerTrimUnits,
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
  };
}
