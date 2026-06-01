import type { AircraftState, ControlInputs } from '../types';
import { B737_800_SPEC, createInitialState } from '../types';
import { eulerToQuat } from '../physics/quaternion';
import { integrate } from '../physics/integrate';
import type { WindInfo } from '../weather';
import { KSEA_RUNWAY_16L } from '../../viewport/runwayData';

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
  wind?: WindInfo | null;
  mutateInputs?: (state: AircraftState, inputs: ControlInputs, elapsedSeconds: number) => void;
}): AircraftState {
  const state = options.state ?? createInitialState(B737_800_SPEC);
  if (!options.state) {
    // Position the default state at KSEA 16L so tests get the expected airport.
    state.position.lat = KSEA_RUNWAY_16L.start.lat;
    state.position.lon = KSEA_RUNWAY_16L.start.lon;
    state.position.alt = KSEA_RUNWAY_16L.elevationFt;
    state.attitude.psi = KSEA_RUNWAY_16L.headingDeg * Math.PI / 180;
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
  }
  const inputs = options.inputs ?? takeoffRollInputs();
  const dt = 1 / options.hz;
  for (let i = 0; i < options.seconds * options.hz; i += 1) {
    options.mutateInputs?.(state, inputs, i * dt);
    integrate(state, inputs, B737_800_SPEC, dt, null, null, options.wind ?? null);
  }
  return state;
}
