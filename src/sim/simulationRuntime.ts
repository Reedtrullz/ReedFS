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

export type SimulationRuntimeKind = 'main-thread' | 'worker-handler-parity';

export interface SimulationRuntime {
  readonly kind: SimulationRuntimeKind;
  step(input: SimulationStepInput): SimulationStepResult;
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

export const mainThreadSimulationRuntime = new MainThreadSimulationRuntime();
export const workerHandlerSimulationRuntime = new WorkerHandlerSimulationRuntime();

let currentRuntime: SimulationRuntime = mainThreadSimulationRuntime;

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
