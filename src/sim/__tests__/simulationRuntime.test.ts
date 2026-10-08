import { afterEach, describe, expect, it } from 'vitest';
import * as simulationRuntimeModule from '../simulationRuntime';
import { buildGuidanceState } from '../guidanceState';
import { handleSimulationWorkerMessage } from '../simulationWorker';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { createNoRouteStatus } from '../systems/navigation';
import { B737_800_SPEC, createInitialState, type ControlInputs } from '../types';
import type { SimulationStepInput } from '../simulationStep';
import {
  BrowserWorkerSimulationRuntime,
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

  it('creates the browser Worker runtime by default and keeps main-thread only for explicit opt-out', () => {
    const createRuntime = createRuntimeFactory();
    let workerCreated = 0;
    const workerFactory = () => {
      workerCreated += 1;
      return new FakeBrowserWorker();
    };

    const defaultRuntime = createRuntime({
      env: {},
      workerFactory,
    });

    expect(defaultRuntime.kind).toBe('browser-worker');
    expect(typeof defaultRuntime.stepAsync).toBe('function');
    expect(workerCreated).toBe(1);
    defaultRuntime.dispose?.();

    const optOutRuntime = createRuntime({
      env: { VITE_RFS_WORKER_PHYSICS: '0' },
      workerFactory,
    });

    expect(optOutRuntime.kind).toBe('main-thread');
    expect(workerCreated).toBe(1);
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

  it('executes multi-step batches per dispatch in parity with the main-thread runtime', async () => {
    const createRuntime = createRuntimeFactory();
    const fakeWorker = new FakeBrowserWorker();
    const runtime = createRuntime({
      env: { VITE_RFS_WORKER_PHYSICS: '1' },
      workerFactory: () => fakeWorker,
    });
    const stepInput = { ...input(), steps: 4 };
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

class FaultWorker {
  readonly messages: unknown[] = [];
  readonly listeners = new Map<string, Set<FakeWorkerListener>>();
  addEventListener(type: string, listener: FakeWorkerListener): void {
    const set = this.listeners.get(type) ?? new Set(); set.add(listener); this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: FakeWorkerListener): void { this.listeners.get(type)?.delete(listener); }
  postMessage(message: unknown): void { this.messages.push(message); }
  emit(type: string, data: unknown = undefined): void { for (const listener of this.listeners.get(type) ?? []) listener({ data }); }
  terminate(): void { this.listeners.clear(); }
}

describe('browser worker failure boundaries', () => {
  it('rejects invalid requests before either worker or fallback executes', async () => {
    const worker = new FaultWorker();
    let fallbacks = 0;
    const runtime = new BrowserWorkerSimulationRuntime({ worker, fallback: { kind: 'main-thread', step: (data) => { fallbacks++; return mainThreadSimulationRuntime.step(data); } } });
    await expect(runtime.stepAsync({ ...input(), dt: NaN })).rejects.toThrow();
    expect(worker.messages).toHaveLength(0); expect(fallbacks).toBe(0); runtime.dispose();
  });
  it('contains malformed replies without throwing from the message listener', async () => {
    const worker = new FaultWorker();
    const runtime = new BrowserWorkerSimulationRuntime({ worker, timeoutMs: 1000 });
    const stepInput = input(); const expected = mainThreadSimulationRuntime.step(stepInput);
    const pending = runtime.stepAsync(stepInput);
    expect(() => worker.emit('message', { protocolVersion: 1, type: 'simulation.step.result', requestId: 'browser-worker-step-1', result: null })).not.toThrow();
    await expect(pending).resolves.toEqual(expected); runtime.dispose();
  });
  it.each(['error', 'messageerror'])('settles %s once and releases listeners on disposal', async (type) => {
    const worker = new FaultWorker(); let fallbacks = 0;
    const runtime = new BrowserWorkerSimulationRuntime({ worker, timeoutMs: 1000, fallback: { kind: 'main-thread', step: (data) => { fallbacks++; return mainThreadSimulationRuntime.step(data); } } });
    const pending = runtime.stepAsync(input());
    worker.emit(type); worker.emit(type);
    expect(fallbacks).toBe(1);
    await expect(pending).resolves.toEqual(mainThreadSimulationRuntime.step(input()));
    expect(fallbacks).toBe(1); runtime.dispose();
    expect([...worker.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
  it('falls back from the validated dispatch snapshot rather than mutable caller state', async () => {
    const worker = new FaultWorker(); const runtime = new BrowserWorkerSimulationRuntime({ worker, timeoutMs: 1 });
    const data = input(); const expected = structuredClone(mainThreadSimulationRuntime.step(data));
    const pending = runtime.stepAsync(data);
    data.pilotInputs.throttle1 = 4; data.aircraft.simTime = 999;
    await expect(pending).resolves.toEqual(expected); runtime.dispose();
  });
  it('rejects a fallback exception without leaving a permanently pending promise', async () => {
    const worker = new FaultWorker();
    const runtime = new BrowserWorkerSimulationRuntime({ worker, fallback: { kind: 'main-thread', step: () => { throw new Error('contained fallback failure'); } } });
    const pending = runtime.stepAsync(input());
    expect(() => worker.emit('message', { protocolVersion: 1, type: 'simulation.step.error', requestId: 'browser-worker-step-1', error: { message: 'worker failure' } })).not.toThrow();
    await expect(pending).rejects.toThrow('contained fallback failure'); runtime.dispose();
  });
});

it('main-thread runtime rejects a nonfinite integrated result before publication', () => {
  const data = input(); data.aircraft.velocity.u = 1e300;
  expect(() => new MainThreadSimulationRuntime().step(data)).toThrow();
});

it('ignores duplicate and late replies while a newer request is pending', async () => {
  const worker = new FaultWorker(); let fallbacks = 0;
  const runtime = new BrowserWorkerSimulationRuntime({ worker, fallback: { kind: 'main-thread', step: (data) => { fallbacks++; return mainThreadSimulationRuntime.step(data); } } });
  const first = runtime.stepAsync(input());
  const firstReply = handleSimulationWorkerMessage(worker.messages[0]);
  worker.emit('message', firstReply); await first;
  const second = runtime.stepAsync(input());
  worker.emit('message', firstReply);
  worker.emit('message', { protocolVersion: 99, requestId: 'browser-worker-step-1', result: null });
  worker.emit('message', handleSimulationWorkerMessage(worker.messages[1]));
  await expect(second).resolves.toEqual(mainThreadSimulationRuntime.step(input()));
  expect(fallbacks).toBe(0); runtime.dispose();
});
