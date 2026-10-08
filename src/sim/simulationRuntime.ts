import { isWorkerPhysicsEnabled, type WorkerPhysicsEnv } from '../config/workerPhysics';
import {
  advanceSimulationBatch,
  type SimulationStepInput,
  type SimulationStepResult,
} from './simulationStep';
import { handleSimulationWorkerMessage } from './simulationWorker';
import { assertSimulationStepInput, assertSimulationStepResult, isRecord } from './simulationValidation';
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
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'error' | 'messageerror', listener: () => void): void;
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
  readonly reject: (error: unknown) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

export class MainThreadSimulationRuntime implements SimulationRuntime {
  readonly kind = 'main-thread' as const;

  step(input: SimulationStepInput): SimulationStepResult {
    assertSimulationStepInput(input);
    const result = advanceSimulationBatch(input, input.steps ?? 1);
    assertSimulationStepResult(result);
    return result;
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

  stepAsync(input: SimulationStepInput): Promise<SimulationStepResult> {
    return Promise.resolve(this.step(input));
  }
}

export class BrowserWorkerSimulationRuntime implements AsyncSimulationRuntime {
  readonly kind = 'browser-worker' as const;
  #requestSeq = 0;
  #disposed = false;
  #workerFailed = false;
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
    this.#worker.addEventListener('error', this.#handleFailure);
    this.#worker.addEventListener('messageerror', this.#handleFailure);
  }

  step(input: SimulationStepInput): SimulationStepResult {
    assertSimulationStepInput(input);
    // Direct synchronous callers retain the validated main-thread path.
    const result = this.#fallback.step(input);
    assertSimulationStepResult(result);
    return result;
  }

  async stepAsync(input: SimulationStepInput): Promise<SimulationStepResult> {
    this.#requestSeq += 1;
    const requestId = `browser-worker-step-${this.#requestSeq}`;
    const request = encodeSimulationStepRequest(requestId, input);
    if (this.#disposed || this.#workerFailed || this.#pending.size >= this.#maxPendingRequests) {
      const result = this.#fallback.step(request.input);
      assertSimulationStepResult(result);
      return result;
    }

    return new Promise<SimulationStepResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.#resolvePendingWithFallback(requestId);
      }, this.#timeoutMs);
      this.#pending.set(requestId, { input: request.input, resolve, reject, timeoutId });

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
    this.#worker.removeEventListener('error', this.#handleFailure);
    this.#worker.removeEventListener('messageerror', this.#handleFailure);
    this.#worker.terminate();
  }

  readonly #handleMessage = (event: { data: unknown }): void => {
    // Ignore duplicate/late IDs before decoding their payloads.
    if (isRecord(event.data) && typeof event.data.requestId === 'string' && !this.#pending.has(event.data.requestId)) return;
    try {
      const response = decodeSimulationStepResponse(event.data);
      const pending = this.#pending.get(response.requestId);
      if (!pending) return;
      if (response.type === 'simulation.step.error') {
        this.#resolvePendingWithFallback(response.requestId);
        return;
      }
      if (response.result.guidance.scenarioId !== pending.input.selectedScenarioId) throw new TypeError('Worker result scenario identity mismatch');
      clearTimeout(pending.timeoutId);
      this.#pending.delete(response.requestId);
      pending.resolve(response.result);
    } catch {
      this.#handleFailure();
    }
  };

  readonly #handleFailure = (): void => {
    this.#workerFailed = true;
    for (const requestId of this.#pending.keys()) this.#resolvePendingWithFallback(requestId);
  };

  #resolvePendingWithFallback(requestId: string): void {
    const pending = this.#pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    this.#pending.delete(requestId);
    try {
      const result = this.#fallback.step(pending.input);
      assertSimulationStepResult(result);
      pending.resolve(result);
    } catch (error) {
      pending.reject(error);
    }
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

// E2E-only probe, baked in when the smoke script builds with VITE_RFS_SMOKE=1.
// Lets worker-physics E2E wrap the real runtime singleton without a dev-only
// module import that cannot resolve in a production preview bundle.
if (import.meta.env.VITE_RFS_SMOKE === '1') {
  (window as unknown as { __RFS_GET_SIMULATION_RUNTIME?: () => SimulationRuntime }).__RFS_GET_SIMULATION_RUNTIME = () => currentRuntime;
}
