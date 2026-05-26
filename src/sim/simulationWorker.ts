import { WORKER_PHYSICS_ENABLED_BY_DEFAULT } from '../config/workerPhysics';
import { advanceSimulationStep } from './simulationStep';
import {
  decodeSimulationStepRequest,
  encodeSimulationStepError,
  encodeSimulationStepResult,
  type SimulationStepResponseMessage,
} from './workerCodec';

export const SIMULATION_WORKER_PHYSICS_ENABLED_BY_DEFAULT = WORKER_PHYSICS_ENABLED_BY_DEFAULT;

const MALFORMED_SIMULATION_WORKER_REQUEST_ID = 'simulation-worker-malformed-request';

type MessageRecord = Record<string, unknown>;

export interface SimulationWorkerMessageEventLike {
  data: unknown;
}

export interface SimulationWorkerScopeLike {
  addEventListener(type: 'message', listener: (event: SimulationWorkerMessageEventLike) => void): void;
  postMessage(message: SimulationStepResponseMessage): void;
}

function isRecord(value: unknown): value is MessageRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requestIdFromUnknownMessage(message: unknown): string {
  if (isRecord(message) && typeof message.requestId === 'string' && message.requestId.length > 0) {
    return message.requestId;
  }

  return MALFORMED_SIMULATION_WORKER_REQUEST_ID;
}

export function handleSimulationWorkerMessage(message: unknown): SimulationStepResponseMessage {
  try {
    const request = decodeSimulationStepRequest(message);
    return encodeSimulationStepResult(request.requestId, advanceSimulationStep(request.input));
  } catch (error) {
    return encodeSimulationStepError(requestIdFromUnknownMessage(message), error);
  }
}

export function registerSimulationWorker(scope: SimulationWorkerScopeLike): void {
  scope.addEventListener('message', (event) => {
    scope.postMessage(handleSimulationWorkerMessage(event.data));
  });
}

type WorkerGlobalCandidate = {
  self?: unknown;
  window?: unknown;
  document?: unknown;
  addEventListener?: unknown;
  postMessage?: unknown;
};

function isWorkerLikeGlobalScope(scope: unknown): scope is SimulationWorkerScopeLike {
  if (!isRecord(scope)) return false;

  const candidate = scope as WorkerGlobalCandidate;
  return (
    candidate.self === scope &&
    typeof candidate.window === 'undefined' &&
    typeof candidate.document === 'undefined' &&
    typeof candidate.addEventListener === 'function' &&
    typeof candidate.postMessage === 'function'
  );
}

if (isWorkerLikeGlobalScope(globalThis)) {
  registerSimulationWorker(globalThis);
}
