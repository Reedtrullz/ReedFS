import { isWorkerPhysicsEnabled, type WorkerPhysicsEnv } from '../config/workerPhysics';
import {
  advanceSimulationStep,
  type SimulationStepInput,
  type SimulationStepResult,
} from './simulationStep';
import { handleSimulationWorkerMessage } from './simulationWorker';
import {
  decodeSimulationStepResponse,
  encodeSimulationStepRequest,
} from './workerCodec';

export type SimulationRuntimeKind = 'main-thread' | 'worker-handler-parity' | 'browser-worker';

export interface SimulationRuntime {
  readonly kind: SimulationRuntimeKind;
  step(input: SimulationStepInput): SimulationStepResult;
  dispose?(): void;
}

export interface AsyncSimulationRuntime extends SimulationRuntime {
  stepAsync(input: SimulationStepInput): Promise<SimulationStepResult>;
}

export interface SimulationWorkerLike {
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type SimulationWorkerFactory = () => SimulationWorkerLike | null;

export interface CreateSimulationRuntimeOptions {
  env?: WorkerPhysicsEnv;
  workerFactory?: SimulationWorkerFactory;
  workerTimeoutMs?: number;
  workerMaxPendingRequests?: number;
  fallback?: SimulationRuntime;
}

interface PendingWorkerRequest {
  readonly input: SimulationStepInput;
  readonly resolve: (result: SimulationStepResult) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

export class MainThreadSimulationRuntime implements SimulationRuntime {
  readonly kind = 'main-thread' as const;

  step(input: SimulationStepInput): SimulationStepResult {
    return advanceSimulationStep(input);
  }
}

export class WorkerHandlerSimulationRuntime implements SimulationRuntime {
  readonly kind = 'worker-handler-parity' as const;
  #requestSeq = 0;

  step(input: SimulationStepInput): SimulationStepResult {
    this.#requestSeq += 1;
    const request = encodeSimulationStepRequest(`runtime-step-${this.#requestSeq}`, input);
    const response = decodeSimulationStepResponse(handleSimulationWorkerMessage(request));
    if (response.type === 'simulation.step.error') {
      throw new Error(`Simulation worker runtime failed: ${response.error.message}`);
    }
    return response.result;
  }
}

export class BrowserWorkerSimulationRuntime implements AsyncSimulationRuntime {
  readonly kind = 'browser-worker' as const;
  #requestSeq = 0;
  #disposed = false;
  readonly #worker: SimulationWorkerLike;
  readonly #fallback: SimulationRuntime;
  readonly #timeoutMs: number;
  readonly #maxPendingRequests: number;
  readonly #pending = new Map<string, PendingWorkerRequest>();

  constructor(options: {
    worker: SimulationWorkerLike;
    fallback?: SimulationRuntime;
    timeoutMs?: number;
    maxPendingRequests?: number;
  }) {
    this.#worker = options.worker;
    this.#fallback = options.fallback ?? mainThreadSimulationRuntime;
    this.#timeoutMs = options.timeoutMs ?? 500;
    this.#maxPendingRequests = options.maxPendingRequests ?? 1;
    this.#worker.addEventListener('message', this.#handleMessage);
  }

  step(input: SimulationStepInput): SimulationStepResult {
    // The current store loop is synchronous. Until the frame scheduler becomes async-aware,
    // a worker-selected runtime exposes the real Worker via stepAsync while sync callers
    // retain a safe main-thread fallback instead of blocking on SharedArrayBuffer/Atomics.
    return this.#fallback.step(input);
  }

  stepAsync(input: SimulationStepInput): Promise<SimulationStepResult> {
    if (this.#disposed || this.#pending.size >= this.#maxPendingRequests) {
      return Promise.resolve(this.#fallback.step(input));
    }

    this.#requestSeq += 1;
    const requestId = `browser-worker-step-${this.#requestSeq}`;
    const request = encodeSimulationStepRequest(requestId, input);

    return new Promise<SimulationStepResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.#resolvePendingWithFallback(requestId);
      }, this.#timeoutMs);
      this.#pending.set(requestId, { input, resolve, timeoutId });

      try {
        this.#worker.postMessage(request);
      } catch {
        this.#resolvePendingWithFallback(requestId);
      }
    });
  }

  dispose(): void {
    this.#disposed = true;
    for (const [requestId] of this.#pending) {
      this.#resolvePendingWithFallback(requestId);
    }
    this.#worker.removeEventListener('message', this.#handleMessage);
    this.#worker.terminate();
  }

  readonly #handleMessage = (event: { data: unknown }): void => {
    const response = decodeSimulationStepResponse(event.data);
    const pending = this.#pending.get(response.requestId);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.#pending.delete(response.requestId);
    if (response.type === 'simulation.step.error') {
      pending.resolve(this.#fallback.step(pending.input));
      return;
    }
    pending.resolve(response.result);
  };

  #resolvePendingWithFallback(requestId: string): void {
    const pending = this.#pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    this.#pending.delete(requestId);
    pending.resolve(this.#fallback.step(pending.input));
  }
}

export const mainThreadSimulationRuntime = new MainThreadSimulationRuntime();
export const workerHandlerSimulationRuntime = new WorkerHandlerSimulationRuntime();

function createDefaultBrowserSimulationWorker(): SimulationWorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./simulationWorker.ts', import.meta.url), { type: 'module' });
}

export function createSimulationRuntime(options: CreateSimulationRuntimeOptions = {}): SimulationRuntime {
  const fallback = options.fallback ?? mainThreadSimulationRuntime;
  if (!isWorkerPhysicsEnabled(options.env)) return fallback;

  let worker: SimulationWorkerLike | null;
  try {
    worker = (options.workerFactory ?? createDefaultBrowserSimulationWorker)();
  } catch {
    return fallback;
  }
  if (!worker) return fallback;

  return new BrowserWorkerSimulationRuntime({
    worker,
    fallback,
    timeoutMs: options.workerTimeoutMs,
    maxPendingRequests: options.workerMaxPendingRequests,
  });
}

let currentRuntime: SimulationRuntime = createSimulationRuntime();

export function getSimulationRuntime(): SimulationRuntime {
  return currentRuntime;
}

export function setSimulationRuntimeForTests(runtime: SimulationRuntime): () => void {
  const previous = currentRuntime;
  currentRuntime = runtime;
  return () => {
    currentRuntime = previous;
  };
}
