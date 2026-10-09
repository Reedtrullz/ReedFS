import type { ControlInputs } from '../../sim/types';
import { B737_800_SPEC } from '../../sim/types';
import { ENVA_TUTORIAL_SCENARIO, createAircraftStateForScenario, scenarioById } from '../../sim/scenarios';
import { buildGuidanceState } from '../../sim/guidanceState';
import { composeControlsSlice, syncGuidanceState } from '../../sim/simulationStep';
import { createNoRouteStatus } from '../../sim/systems/navigation';
import { createAutopilotControllerState } from '../../sim/systems/autopilot';
import { createInputManagerState } from '../../input/InputManager';
import { resetGPWS } from '../../audio/GPWS';
import type { ScenarioWeatherMetadata, WindInfo } from '../../sim/weather';
import type { SimStore } from '../simStore';
import { hasCoherentScenarioClock, parseScenarioUtc, utcHours } from '../../sim/scenarioClock';
import {
  inputManagerForScenario,
  inputsForScenario,
} from '../simStoreInputReducers';
import {
  levelEquilibriumReceiptForScenario,
  solvedScenarioInitialization,
} from '../levelEquilibrium';

export type SimStoreSet = (partial: Partial<SimStore> | ((state: SimStore) => Partial<SimStore>), options?: { trimIntentOnly: boolean }) => void;

export function cloneWind(wind: WindInfo): WindInfo {
  return { ...wind };
}

export function cloneWeather(weather: ScenarioWeatherMetadata): ScenarioWeatherMetadata {
  return {
    ...weather,
    clouds: weather.clouds.map((cloud) => ({ ...cloud })),
    cloudAnchor: { ...weather.cloudAnchor },
  };
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
  | 'routeEditSession'
  | 'routeEditMessage'
  | 'apState'
  | 'apControllerState'
  | 'flightPlan'
  | 'activeLegIndex'
  | 'routeStatus'
  | 'wind'
  | 'weather'
  | 'weatherEpoch'
  | 'weatherRestored'
  | 'selectedScenarioId'
  | 'asyncPhysicsGeneration'
  | 'asyncPhysicsInFlight'
  | 'guidance'
  | 'controlFeedbackMessage'
  | 'levelEquilibriumReceipt'
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
  | 'setScenarioUtc'
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
  const initialSolved = solvedScenarioInitialization(ENVA_TUTORIAL_SCENARIO);

  return {
    aircraft: initialAircraft,
    ...initialControls,
    inputManager: initialSolved ? initialSolved.inputManager : inputManagerForScenario(ENVA_TUTORIAL_SCENARIO),
    spec: B737_800_SPEC,
    status: 'stopped',
    lastFrameTime: 0,
    fixedStepAccumulatorSeconds: 0,
    simulationTimeSeconds: 0,
    droppedSimulationTimeSeconds: 0,
    apState: null,
    apControllerState: initialAutopilotControllerState,
    flightPlan: null,
    routeEditSession: null,
    routeEditMessage: null,
    activeLegIndex: null,
    routeStatus: initialRouteStatus,
    wind: cloneWind(ENVA_TUTORIAL_SCENARIO.wind),
    weather: cloneWeather(ENVA_TUTORIAL_SCENARIO.weather),
    weatherEpoch: 0,
    weatherRestored: false,
    asyncPhysicsGeneration: 0,
    asyncPhysicsInFlight: false,
    selectedScenarioId: ENVA_TUTORIAL_SCENARIO.id,
    guidance: initialGuidance,
    controlFeedbackMessage: null,
    levelEquilibriumReceipt: levelEquilibriumReceiptForScenario(ENVA_TUTORIAL_SCENARIO),
    scenarioPersistenceMessage: null,
    scenarioSaveSlots: [],

    setScenarioUtc: (text) => {
      const utc = parseScenarioUtc(text);
      let changed = false;
      set((s) => {
        if (utc === null || s.status === 'running' || (s.simulationFailure && !s.simulationFailure.recovered)) return {};
        const utcEpochMs = utc - s.aircraft.simTime;
        const aircraft = { ...s.aircraft, utcEpochMs, timeOfDay: utcHours(utcEpochMs + s.aircraft.simTime) };
        if (!hasCoherentScenarioClock(aircraft)) return {};
        changed = true;
        return {
          aircraft,
          asyncPhysicsGeneration: s.asyncPhysicsGeneration + 1, asyncPhysicsInFlight: false,
          asyncReservedSteps: 0, fixedStepAccumulatorSeconds: 0, lastFrameTime: 0,
          simulationCommit: null,
        };
      });
      return changed;
    },

    start: () => set((s) => {
      if (s.simulationFailure && !s.simulationFailure.recovered) return {};
      const scenario = scenarioById(s.selectedScenarioId);
      return {
        status: 'running',
        lastFrameTime: 0,
        fixedStepAccumulatorSeconds: 0,
        controlFeedbackMessage: null,
        guidance: syncGuidanceState(s.guidance, scenario, 'running', s.aircraft, s.effectiveControls),
      };
    }),

    startTakeoffRoll: () => set((s) => {
      if (s.simulationFailure && !s.simulationFailure.recovered) return {};
      const aircraft = structuredClone(s.aircraft);
      const scenario = scenarioById(s.selectedScenarioId);
      const startsAirborne = !aircraft.ground.weightOnWheels && aircraft.flightPhase !== 'PARKED';
      if (!startsAirborne) aircraft.flightPhase = 'TAKEOFF';
      const pilotInputs: ControlInputs = {
        ...s.pilotInputs,
        gearLever: startsAirborne ? s.pilotInputs.gearLever : 'DOWN',
        brake: 0,
        leftBrake: 0,
        rightBrake: 0,
        elevator: 0,
      };
      const apControllerState = createAutopilotControllerState();
      const controlsSlice = composeControlsSlice(pilotInputs);
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
        controlFeedbackMessage: null,
        guidance: syncGuidanceState(s.guidance, scenario, 'running', aircraft, controlsSlice.effectiveControls),
      };
    }),

    abortTakeoff: () => set((s) => {
      if (s.simulationFailure && !s.simulationFailure.recovered) return {};
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
        controlFeedbackMessage: null,
        guidance: syncGuidanceState(s.guidance, scenario, 'running', aircraft, controlsSlice.effectiveControls),
      };
    }),

    pause: () => set((s) => {
      const scenario = scenarioById(s.selectedScenarioId);
      return {
        status: 'paused',
        asyncPhysicsInFlight: false,
        asyncPhysicsGeneration: s.asyncPhysicsGeneration + 1,
        guidance: syncGuidanceState(s.guidance, scenario, 'paused', s.aircraft, s.effectiveControls),
      };
    }),

    resume: () => set((s) => {
      if (s.simulationFailure && !s.simulationFailure.recovered) return {};
      const scenario = scenarioById(s.selectedScenarioId);
      return {
        status: 'running',
        lastFrameTime: 0,
        fixedStepAccumulatorSeconds: 0,
        controlFeedbackMessage: null,
        guidance: syncGuidanceState(s.guidance, scenario, 'running', s.aircraft, s.effectiveControls),
      };
    }),

    reset: () => set((s) => {
      resetGPWS();
      const scenario = scenarioById(s.selectedScenarioId);
      const solved = solvedScenarioInitialization(scenario);
      const pilotInputs = solved ? solved.pilotInputs : inputsForScenario(scenario);
      const aircraft = solved ? structuredClone(solved.aircraft) : createAircraftStateForScenario(B737_800_SPEC, scenario);
      const controlsSlice = composeControlsSlice(pilotInputs);
      const apControllerState = createAutopilotControllerState();
      return {
        aircraft,
        ...controlsSlice,
        inputManager: solved ? solved.inputManager : inputManagerForScenario(scenario),
        levelEquilibriumReceipt: levelEquilibriumReceiptForScenario(scenario),
        status: 'stopped',
        simulationFailure: s.simulationFailure ? { ...s.simulationFailure, recovered: true } : null,
        lastValidCheckpoint: null,
        lastFrameTime: 0,
        fixedStepAccumulatorSeconds: 0,
        simulationTimeSeconds: 0,
        droppedSimulationTimeSeconds: 0,
        simRate: 1,
        apState: null,
        apControllerState,
        flightPlan: null,
        activeLegIndex: null,
        routeStatus: createNoRouteStatus(),
        routeEditSession: null,
        routeEditMessage: null,
        wind: cloneWind(scenario.wind),
        weather: cloneWeather(scenario.weather),
        weatherEpoch: s.weatherEpoch + 1,
        weatherRestored: false,
        asyncPhysicsGeneration: s.asyncPhysicsGeneration + 1,
        asyncPhysicsInFlight: false,
        controlFeedbackMessage: null,
        guidance: buildGuidanceState({
          scenario,
          status: 'stopped',
          aircraft,
          controls: controlsSlice.effectiveControls,
        }),
      };
    }),

    setScenario: (scenarioId) => set((s) => {
      resetGPWS();
      const scenario = scenarioById(scenarioId);
      const solved = solvedScenarioInitialization(scenario);
      const pilotInputs = solved ? solved.pilotInputs : inputsForScenario(scenario);
      const aircraft = solved ? structuredClone(solved.aircraft) : createAircraftStateForScenario(B737_800_SPEC, scenario);
      const controlsSlice = composeControlsSlice(pilotInputs);
      const apControllerState = createAutopilotControllerState();
      return {
        selectedScenarioId: scenario.id,
        aircraft,
        ...controlsSlice,
        inputManager: solved ? solved.inputManager : inputManagerForScenario(scenario),
        levelEquilibriumReceipt: levelEquilibriumReceiptForScenario(scenario),
        status: 'stopped',
        simulationFailure: s.simulationFailure ? { ...s.simulationFailure, recovered: true } : null,
        lastValidCheckpoint: null,
        lastFrameTime: 0,
        fixedStepAccumulatorSeconds: 0,
        simulationTimeSeconds: 0,
        droppedSimulationTimeSeconds: 0,
        apState: null,
        apControllerState,
        flightPlan: null,
        activeLegIndex: null,
        routeStatus: createNoRouteStatus(),
        routeEditSession: null,
        routeEditMessage: null,
        wind: cloneWind(scenario.wind),
        weather: cloneWeather(scenario.weather),
        weatherEpoch: s.weatherEpoch + 1,
        weatherRestored: false,
        asyncPhysicsGeneration: s.asyncPhysicsGeneration + 1,
        asyncPhysicsInFlight: false,
        controlFeedbackMessage: null,
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
