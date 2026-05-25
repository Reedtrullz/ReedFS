import { create } from 'zustand';
import type { AircraftState, ControlInputs, AircraftSpec } from '../sim/types';
import { createInitialState, B737_800_SPEC } from '../sim/types';
import { integrate } from '../sim/physics/integrate';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../sim/weather';

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
  setInput: (partial: Partial<ControlInputs>) => void;
  tick: (timestamp: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
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

export const useSimStore = create<SimStore>((set, get) => ({
  aircraft: createInitialState(B737_800_SPEC),
  inputs: { ...defaultInputs },
  spec: B737_800_SPEC,
  status: 'stopped',
  lastFrameTime: 0,
  apState: null,
  flightPlan: null,
  wind: null,

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
  pause: () => set({ status: 'paused' }),
  resume: () => set({ status: 'running', lastFrameTime: 0 }),
  reset: () => set({
    aircraft: createInitialState(B737_800_SPEC),
    inputs: { ...defaultInputs },
    status: 'stopped',
    lastFrameTime: 0,
    apState: null,
    flightPlan: null,
  }),

  setApState: (ap) => set({ apState: ap }),
  setFlightPlan: (fp) => set({ flightPlan: fp }),
  setWind: (w) => set({ wind: w }),
}));
