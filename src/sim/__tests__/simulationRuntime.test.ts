import { afterEach, describe, expect, it } from 'vitest';
import * as simulationRuntimeModule from '../simulationRuntime';
import { buildGuidanceState } from '../guidanceState';
import { handleSimulationWorkerMessage } from '../simulationWorker';
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

type RuntimeModuleExports = typeof simulationRuntimeModule & Record<string, unknown>;
type CreateSimulationRuntime = (options?: {
  env?: Record<string, string | boolean | undefined>;
  workerFactory?: () => FakeBrowserWorker;
  workerTimeoutMs?: number;
  workerMaxPendingRequests?: number;
}) => {
  readonly kind: string;
  step(input: SimulationStepInput): unknown;
  stepAsync?: (input: SimulationStepInput) => Promise<unknown>;
  dispose?: () => void;
};

type FakeWorkerMessageEvent = { data: unknown };
type FakeWorkerListener = (event: FakeWorkerMessageEvent) => void;

class FakeBrowserWorker {
  readonly messages: unknown[] = [];
  #listeners = new Set<FakeWorkerListener>();
  #respond: boolean;

  constructor({ respond = true }: { respond?: boolean } = {}) {
    this.#respond = respond;
  }

  addEventListener(type: 'message', listener: FakeWorkerListener): void {
    if (type === 'message') this.#listeners.add(listener);
  }

  removeEventListener(type: 'message', listener: FakeWorkerListener): void {
    if (type === 'message') this.#listeners.delete(listener);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
    if (!this.#respond) return;
    const response = handleSimulationWorkerMessage(message);
    queueMicrotask(() => {
      for (const listener of this.#listeners) listener({ data: response });
    });
  }

  terminate(): void {
    this.#listeners.clear();
  }
}

function createRuntimeFactory(): CreateSimulationRuntime {
  const createRuntime = (simulationRuntimeModule as RuntimeModuleExports).createSimulationRuntime;
  expect(typeof createRuntime).toBe('function');
  return createRuntime as CreateSimulationRuntime;
}

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

  it('keeps the browser Worker runtime default-off and creates it only for the explicit env flag', () => {
    const createRuntime = createRuntimeFactory();
    let workerCreated = false;

    const defaultRuntime = createRuntime({
      env: {},
      workerFactory: () => {
        workerCreated = true;
        return new FakeBrowserWorker();
      },
    });

    expect(defaultRuntime.kind).toBe('main-thread');
    expect(workerCreated).toBe(false);

    const workerRuntime = createRuntime({
      env: { VITE_RFS_WORKER_PHYSICS: '1' },
      workerFactory: () => new FakeBrowserWorker(),
    });

    expect(workerRuntime.kind).toBe('browser-worker');
    expect(typeof workerRuntime.stepAsync).toBe('function');
    workerRuntime.dispose?.();
  });

  it('falls back to main-thread when explicit browser Worker construction fails', () => {
    const createRuntime = createRuntimeFactory();

    const runtime = createRuntime({
      env: { VITE_RFS_WORKER_PHYSICS: '1' },
      workerFactory: () => {
        throw new Error('worker blocked by browser policy');
      },
    });

    expect(runtime.kind).toBe('main-thread');
  });

  it('runs one real Worker protocol round-trip with output parity against the main-thread runtime', async () => {
    const createRuntime = createRuntimeFactory();
    const fakeWorker = new FakeBrowserWorker();
    const runtime = createRuntime({
      env: { VITE_RFS_WORKER_PHYSICS: '1' },
      workerFactory: () => fakeWorker,
    });
    const stepInput = input();
    const expected = new MainThreadSimulationRuntime().step(stepInput);

    await expect(runtime.stepAsync?.(stepInput)).resolves.toEqual(expected);
    expect(fakeWorker.messages).toHaveLength(1);
    expect(stepInput.aircraft.simTime).toBe(0);
    runtime.dispose?.();
  });

  it('falls back to main-thread stepping when the browser Worker times out', async () => {
    const createRuntime = createRuntimeFactory();
    const runtime = createRuntime({
      env: { VITE_RFS_WORKER_PHYSICS: '1' },
      workerFactory: () => new FakeBrowserWorker({ respond: false }),
      workerTimeoutMs: 1,
    });
    const stepInput = input();
    const expected = new MainThreadSimulationRuntime().step(stepInput);

    await expect(runtime.stepAsync?.(stepInput)).resolves.toEqual(expected);
    runtime.dispose?.();
  });
});
