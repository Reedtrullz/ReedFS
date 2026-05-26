import type { SimulationStepInput, SimulationStepResult } from './simulationStep';

export const SIMULATION_WORKER_PROTOCOL_VERSION = 1 as const;
export const SIMULATION_STEP_REQUEST_TYPE = 'simulation.step.request' as const;
export const SIMULATION_STEP_RESULT_TYPE = 'simulation.step.result' as const;
export const SIMULATION_STEP_ERROR_TYPE = 'simulation.step.error' as const;

type SimulationWorkerProtocolVersion = typeof SIMULATION_WORKER_PROTOCOL_VERSION;
type SimulationWorkerMessageType =
  | typeof SIMULATION_STEP_REQUEST_TYPE
  | typeof SIMULATION_STEP_RESULT_TYPE
  | typeof SIMULATION_STEP_ERROR_TYPE;

interface SimulationWorkerEnvelope {
  protocolVersion: SimulationWorkerProtocolVersion;
  type: SimulationWorkerMessageType;
  requestId: string;
}

export interface SimulationWorkerErrorPayload {
  name: string;
  message: string;
  stack?: string;
}

export interface SimulationStepRequestMessage {
  protocolVersion: SimulationWorkerProtocolVersion;
  type: typeof SIMULATION_STEP_REQUEST_TYPE;
  requestId: string;
  input: SimulationStepInput;
}

export interface SimulationStepResultResponseMessage {
  protocolVersion: SimulationWorkerProtocolVersion;
  type: typeof SIMULATION_STEP_RESULT_TYPE;
  requestId: string;
  result: SimulationStepResult;
}

export interface SimulationStepErrorResponseMessage {
  protocolVersion: SimulationWorkerProtocolVersion;
  type: typeof SIMULATION_STEP_ERROR_TYPE;
  requestId: string;
  error: SimulationWorkerErrorPayload;
}

export type SimulationStepResponseMessage =
  | SimulationStepResultResponseMessage
  | SimulationStepErrorResponseMessage;

export type SimulationWorkerMessage = SimulationStepRequestMessage | SimulationStepResponseMessage;

type MessageRecord = Record<string, unknown>;

function cloneForWorker<T>(value: T): T {
  return structuredClone(value);
}

function assertRequestId(requestId: string): string {
  if (requestId.length === 0) {
    throw new TypeError('Simulation worker messages require a non-empty requestId');
  }
  return requestId;
}

function isRecord(value: unknown): value is MessageRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown): MessageRecord {
  if (!isRecord(value)) {
    throw new TypeError('Simulation worker message must be a plain object');
  }
  return value;
}

function isMessageType(value: unknown): value is SimulationWorkerMessageType {
  return (
    value === SIMULATION_STEP_REQUEST_TYPE ||
    value === SIMULATION_STEP_RESULT_TYPE ||
    value === SIMULATION_STEP_ERROR_TYPE
  );
}

function readEnvelope(record: MessageRecord): SimulationWorkerEnvelope {
  if (record.protocolVersion !== SIMULATION_WORKER_PROTOCOL_VERSION) {
    throw new TypeError(`Unsupported simulation worker protocol version: ${String(record.protocolVersion)}`);
  }
  if (!isMessageType(record.type)) {
    throw new TypeError(`Unsupported simulation worker message type: ${String(record.type)}`);
  }
  if (typeof record.requestId !== 'string' || record.requestId.length === 0) {
    throw new TypeError('Simulation worker message is missing requestId');
  }

  return {
    protocolVersion: SIMULATION_WORKER_PROTOCOL_VERSION,
    type: record.type,
    requestId: record.requestId,
  };
}

function readMessage(message: unknown): { envelope: SimulationWorkerEnvelope; record: MessageRecord } {
  const record = requireRecord(message);
  return { envelope: readEnvelope(record), record };
}

function requirePayload(record: MessageRecord, key: string): unknown {
  if (!(key in record)) {
    throw new TypeError(`Simulation worker message is missing ${key}`);
  }
  return record[key];
}

function errorPayloadFrom(error: unknown): SimulationWorkerErrorPayload {
  if (error instanceof Error) {
    const payload: SimulationWorkerErrorPayload = {
      name: error.name || 'Error',
      message: error.message,
    };
    if (typeof error.stack === 'string') payload.stack = error.stack;
    return payload;
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error };
  }

  if (isRecord(error)) {
    const payload: SimulationWorkerErrorPayload = {
      name: typeof error.name === 'string' && error.name.length > 0 ? error.name : 'Error',
      message: typeof error.message === 'string' ? error.message : 'Unknown simulation worker error',
    };
    if (typeof error.stack === 'string') payload.stack = error.stack;
    return payload;
  }

  return { name: 'Error', message: error == null ? 'Unknown simulation worker error' : String(error) };
}

function decodeErrorPayload(error: unknown): SimulationWorkerErrorPayload {
  const record = requireRecord(error);
  if (typeof record.message !== 'string') {
    throw new TypeError('Simulation worker error response is missing message');
  }

  const payload: SimulationWorkerErrorPayload = {
    name: typeof record.name === 'string' && record.name.length > 0 ? record.name : 'Error',
    message: record.message,
  };
  if (typeof record.stack === 'string') payload.stack = record.stack;
  return payload;
}

export function encodeSimulationStepRequest(
  requestId: string,
  input: SimulationStepInput,
): SimulationStepRequestMessage {
  return {
    protocolVersion: SIMULATION_WORKER_PROTOCOL_VERSION,
    type: SIMULATION_STEP_REQUEST_TYPE,
    requestId: assertRequestId(requestId),
    input: cloneForWorker(input),
  };
}

export function decodeSimulationStepRequest(message: unknown): SimulationStepRequestMessage {
  const { envelope, record } = readMessage(message);
  if (envelope.type !== SIMULATION_STEP_REQUEST_TYPE) {
    throw new TypeError(`Expected simulation step request, received ${envelope.type}`);
  }

  return {
    protocolVersion: envelope.protocolVersion,
    type: SIMULATION_STEP_REQUEST_TYPE,
    requestId: envelope.requestId,
    input: cloneForWorker(requirePayload(record, 'input') as SimulationStepInput),
  };
}

export function encodeSimulationStepResult(
  requestId: string,
  result: SimulationStepResult,
): SimulationStepResultResponseMessage {
  return {
    protocolVersion: SIMULATION_WORKER_PROTOCOL_VERSION,
    type: SIMULATION_STEP_RESULT_TYPE,
    requestId: assertRequestId(requestId),
    result: cloneForWorker(result),
  };
}

export function encodeSimulationStepError(
  requestId: string,
  error: unknown,
): SimulationStepErrorResponseMessage {
  return {
    protocolVersion: SIMULATION_WORKER_PROTOCOL_VERSION,
    type: SIMULATION_STEP_ERROR_TYPE,
    requestId: assertRequestId(requestId),
    error: cloneForWorker(errorPayloadFrom(error)),
  };
}

export function decodeSimulationStepResponse(message: unknown): SimulationStepResponseMessage {
  const { envelope, record } = readMessage(message);

  if (envelope.type === SIMULATION_STEP_RESULT_TYPE) {
    return {
      protocolVersion: envelope.protocolVersion,
      type: SIMULATION_STEP_RESULT_TYPE,
      requestId: envelope.requestId,
      result: cloneForWorker(requirePayload(record, 'result') as SimulationStepResult),
    };
  }

  if (envelope.type === SIMULATION_STEP_ERROR_TYPE) {
    return {
      protocolVersion: envelope.protocolVersion,
      type: SIMULATION_STEP_ERROR_TYPE,
      requestId: envelope.requestId,
      error: decodeErrorPayload(requirePayload(record, 'error')),
    };
  }

  throw new TypeError(`Expected simulation step response, received ${envelope.type}`);
}
