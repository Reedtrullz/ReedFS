import { create } from 'zustand';
import type { AircraftState, ControlInputs, AircraftSpec } from '../sim/types';
import { B737_800_SPEC } from '../sim/types';
import { integrate } from '../sim/physics/integrate';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../sim/weather';
import { KSEA_TUTORIAL_SCENARIO, createAircraftStateForScenario, scenarioById } from '../sim/scenarios';
import type { FlightScenario } from '../sim/scenarios';

export type SimStatus = 'stopped' | 'running' | 'paused';

export interface SimStore {
  aircraft: AircraftState;
  inputs: ControlInputs;
  spec: AircraftSpec;
  status: SimStatus;
  lastFrameTime: number;
  apState: AutopilotState | null;
  flightPlan: FlightPlan | null;
  wind: WindInfo | null;
  selectedScenarioId: string;
  setInput: (partial: Partial<ControlInputs>) => void;
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

export const useSimStore = create<SimStore>((set, get) => ({
  aircraft: createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO),
  inputs: inputsForScenario(KSEA_TUTORIAL_SCENARIO),
  spec: B737_800_SPEC,
  status: 'stopped',
  lastFrameTime: 0,
  apState: null,
  flightPlan: null,
  wind: cloneWind(KSEA_TUTORIAL_SCENARIO.wind),
  selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,

  setInput: (partial) => set((s) => ({ inputs: { ...s.inputs, ...partial } })),

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
    return {
      aircraft,
      inputs: {
        ...s.inputs,
        throttle1: 1,
        throttle2: 1,
        flapLever: aircraft.config.flapSetting,
        gearLever: 'DOWN',
        brake: 0,
        elevator: 0,
      },
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
