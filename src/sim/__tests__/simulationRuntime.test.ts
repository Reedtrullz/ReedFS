import { afterEach, describe, expect, it } from 'vitest';
import { buildGuidanceState } from '../guidanceState';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { createNoRouteStatus } from '../systems/navigation';
import { B737_800_SPEC, createInitialState, type ControlInputs } from '../types';
import type { SimulationStepInput } from '../simulationStep';
import {
  MainThreadSimulationRuntime,
  WorkerHandlerSimulationRuntime,
  getSimulationRuntime,
  mainThreadSimulationRuntime,
  setSimulationRuntimeForTests,
} from '../simulationRuntime';

function controls(): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0.7,
    throttle2: 0.7,
    flapLever: KSEA_TUTORIAL_SCENARIO.flapSetting,
    gearLever: 'DOWN',
    spoilers: 0,
    brake: 0,
  };
}

function input(): SimulationStepInput {
  const aircraft = createInitialState(B737_800_SPEC);
  const pilotInputs = controls();
  return {
    aircraft,
    spec: B737_800_SPEC,
    pilotInputs,
    apState: null,
    flightPlan: null,
    activeLegIndex: null,
    routeStatus: createNoRouteStatus(),
    wind: { ...KSEA_TUTORIAL_SCENARIO.wind },
    dt: 1 / 60,
    status: 'running',
    selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
    guidance: buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft,
      controls: pilotInputs,
    }),
  };
}

afterEach(() => {
  setSimulationRuntimeForTests(mainThreadSimulationRuntime);
});

describe('simulation runtime adapters', () => {
  it('keeps the worker-handler runtime step in parity with the main-thread runtime', () => {
    const stepInput = input();
    const main = new MainThreadSimulationRuntime().step(stepInput);
    const workerHandler = new WorkerHandlerSimulationRuntime().step(stepInput);

    expect(workerHandler).toEqual(main);
    expect(stepInput.aircraft.simTime).toBe(0);
  });

  it('allows tests to swap the active runtime without changing store API', () => {
    const restore = setSimulationRuntimeForTests(new WorkerHandlerSimulationRuntime());
    expect(getSimulationRuntime().kind).toBe('worker-handler-parity');
    restore();
    expect(getSimulationRuntime().kind).toBe('main-thread');
  });
});
