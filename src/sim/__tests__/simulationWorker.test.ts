import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGuidanceState } from '../guidanceState';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { advanceSimulationStep, type SimulationStepInput } from '../simulationStep';
import { createNoRouteStatus } from '../systems/navigation';
import { B737_800_SPEC, createInitialState, type ControlInputs } from '../types';
import {
  decodeSimulationStepResponse,
  encodeSimulationStepRequest,
  SIMULATION_STEP_REQUEST_TYPE,
  SIMULATION_WORKER_PROTOCOL_VERSION,
} from '../workerCodec';
import {
  handleSimulationWorkerMessage,
  registerSimulationWorker,
  SIMULATION_WORKER_PHYSICS_ENABLED_BY_DEFAULT,
} from '../simulationWorker';

function tutorialControls(): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0,
    throttle2: 0,
    flapLever: KSEA_TUTORIAL_SCENARIO.flapSetting,
    gearLever: 'DOWN',
    spoilers: 0,
    brake: 0,
  };
}

function simulationStepInput(): SimulationStepInput {
  const aircraft = createInitialState(B737_800_SPEC);
  const pilotInputs = tutorialControls();
  const guidance = buildGuidanceState({
    scenario: KSEA_TUTORIAL_SCENARIO,
    status: 'running',
    aircraft,
    controls: pilotInputs,
  });

  return {
    aircraft,
    spec: B737_800_SPEC,
    pilotInputs,
    apState: null,
    flightPlan: null,
    activeLegIndex: null,
    routeStatus: createNoRouteStatus(),
    wind: null,
    dt: 1 / 60,
    status: 'running',
    selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
    guidance,
  };
}

function expectResultResponse(
  response: ReturnType<typeof decodeSimulationStepResponse>,
): asserts response is ReturnType<typeof decodeSimulationStepResponse> & { type: 'simulation.step.result' } {
  expect(response.type).toBe('simulation.step.result');
  if (response.type !== 'simulation.step.result') {
    throw new Error(`expected result response, got ${response.type}`);
  }
}

function expectErrorResponse(
  response: ReturnType<typeof decodeSimulationStepResponse>,
): asserts response is ReturnType<typeof decodeSimulationStepResponse> & { type: 'simulation.step.error' } {
  expect(response.type).toBe('simulation.step.error');
  if (response.type !== 'simulation.step.error') {
    throw new Error(`expected error response, got ${response.type}`);
  }
}

type FakeWorkerMessageEvent = { data: unknown };
type FakeWorkerScope = {
  addEventListener: ReturnType<typeof vi.fn<(type: string, listener: (event: FakeWorkerMessageEvent) => void) => void>>;
  postMessage: ReturnType<typeof vi.fn<(message: unknown) => void>>;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simulationWorker', () => {
  it('documents that worker physics is disabled by default', () => {
    expect(SIMULATION_WORKER_PHYSICS_ENABLED_BY_DEFAULT).toBe(false);
  });

  it('handles a simulation step request with a result matching the direct simulation step', () => {
    const input = simulationStepInput();
    const request = encodeSimulationStepRequest('worker-step-1', input);

    const response = decodeSimulationStepResponse(handleSimulationWorkerMessage(request));

    expectResultResponse(response);
    expect(response.requestId).toBe('worker-step-1');
    expect(response.result).toEqual(advanceSimulationStep(input));
  });

  it('returns an error response preserving requestId when a request is missing input', () => {
    const response = decodeSimulationStepResponse(handleSimulationWorkerMessage({
      protocolVersion: SIMULATION_WORKER_PROTOCOL_VERSION,
      type: SIMULATION_STEP_REQUEST_TYPE,
      requestId: 'worker-step-missing-input',
    }));

    expectErrorResponse(response);
    expect(response.requestId).toBe('worker-step-missing-input');
    expect(response.error.name).toBe('TypeError');
    expect(response.error.message).toContain('missing input');
  });

  it('registers a message listener that posts exactly one simulation step result', () => {
    const listeners: Array<(event: FakeWorkerMessageEvent) => void> = [];
    const fakeScope: FakeWorkerScope = {
      addEventListener: vi.fn((type, listener) => {
        if (type === 'message') listeners.push(listener);
      }),
      postMessage: vi.fn(),
    };
    const input = simulationStepInput();

    registerSimulationWorker(fakeScope);
    listeners[0]({ data: encodeSimulationStepRequest('registered-worker-step', input) });

    expect(fakeScope.addEventListener).toHaveBeenCalledTimes(1);
    expect(fakeScope.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(fakeScope.postMessage).toHaveBeenCalledTimes(1);
    const response = decodeSimulationStepResponse(fakeScope.postMessage.mock.calls[0][0]);
    expectResultResponse(response);
    expect(response.requestId).toBe('registered-worker-step');
    expect(response.result).toEqual(advanceSimulationStep(input));
  });

  it('does not auto-register or post messages when imported in vitest jsdom', async () => {
    vi.resetModules();
    const addEventListenerSpy = vi.spyOn(globalThis, 'addEventListener');
    const postMessageSpy = vi.spyOn(globalThis, 'postMessage');

    await import('../simulationWorker');

    expect(addEventListenerSpy).not.toHaveBeenCalled();
    expect(postMessageSpy).not.toHaveBeenCalled();
  });
});
