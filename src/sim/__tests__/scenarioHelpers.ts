import type { AircraftState, ControlInputs } from '../types';
import { B737_800_SPEC, createInitialState } from '../types';
import { integrate } from '../physics/integrate';

export function takeoffRollInputs(overrides: Partial<ControlInputs> = {}): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 1,
    throttle2: 1,
    flapLever: 5,
    gearLever: 'DOWN',
    spoilers: 0,
    brake: 0,
    ...overrides,
  };
}

export function runFixedStepScenario(options: {
  seconds: number;
  hz: number;
  state?: AircraftState;
  inputs?: ControlInputs;
  mutateInputs?: (state: AircraftState, inputs: ControlInputs, elapsedSeconds: number) => void;
}): AircraftState {
  const state = options.state ?? createInitialState(B737_800_SPEC);
  const inputs = options.inputs ?? takeoffRollInputs();
  const dt = 1 / options.hz;
  for (let i = 0; i < options.seconds * options.hz; i += 1) {
    options.mutateInputs?.(state, inputs, i * dt);
    integrate(state, inputs, B737_800_SPEC, dt);
  }
  return state;
}
