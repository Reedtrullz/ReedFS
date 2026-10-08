import type { SimStore } from './simStore';

export interface CommandRevisions { pilot: number; autoflight: number; route: number; environment: number }
export interface SimulationCommit {
  stepIndex: number;
  revisions: CommandRevisions;
  committedAtMs: number;
  batchSteps: number;
  batchDurationMs: number;
  commandLatencyMs: number;
  achievedSimRate: number | null;
  rateWindowStartMs: number;
  rateWindowStartSimSeconds: number;
  observation: Pick<SimStore, 'aircraft' | 'apState' | 'flightPlan' | 'routeStatus' | 'wind' | 'weather' | 'guidance' | 'apCommands'>;
}

export function commitRate(previous: SimulationCommit | null, now: number, simulationSeconds: number) {
  const start = previous?.rateWindowStartMs ?? now;
  const from = previous?.rateWindowStartSimSeconds ?? simulationSeconds;
  const elapsed = now - start;
  return elapsed >= 1000
    ? { achievedSimRate: Math.max(0, simulationSeconds - from) * 1000 / elapsed, rateWindowStartMs: now, rateWindowStartSimSeconds: simulationSeconds }
    : { achievedSimRate: previous?.achievedSimRate ?? null, rateWindowStartMs: start, rateWindowStartSimSeconds: from };
}

export function appliedCommandLatency(state: SimStore, now: number): number {
  const previous = state.simulationCommit;
  if (previous && (Object.keys(state.commandRevisions) as Array<keyof CommandRevisions>).every((key) => previous.revisions[key] === state.commandRevisions[key])) return previous.commandLatencyMs;
  return state.commandAcceptedAtMs > 0 ? Math.max(0, now - state.commandAcceptedAtMs) : 0;
}

/** Product actions record acceptance separately from the physics commit. */
export function commandBoundaryPatch(state: SimStore, patch: Partial<SimStore>): Partial<SimStore> {
  const trimChanged = patch.inputManager !== undefined && patch.inputManager.stabilizerTrimUnits !== state.inputManager.stabilizerTrimUnits;
  const pilot = trimChanged || (patch.pilotInputs !== undefined && (Object.keys(patch.pilotInputs) as Array<keyof SimStore['pilotInputs']>).some((key) => patch.pilotInputs?.[key] !== state.pilotInputs[key]));
  const autoflight = patch.apState !== undefined && patch.apState !== state.apState;
  const route = patch.flightPlan !== undefined && patch.flightPlan !== state.flightPlan;
  const environment = (patch.wind !== undefined && patch.wind !== state.wind) || (patch.weather !== undefined && patch.weather !== state.weather);
  const aircraftReplaced = patch.aircraft !== undefined && patch.aircraft !== state.aircraft && !trimChanged;
  const fence = autoflight || route || environment || aircraftReplaced;
  const epochChanged = fence || (patch.asyncPhysicsGeneration !== undefined && patch.asyncPhysicsGeneration !== state.asyncPhysicsGeneration);
  const result = { ...patch };
  if (patch.status !== undefined && patch.status !== state.status && state.simulationCommit) {
    result.simulationCommit = { ...state.simulationCommit, achievedSimRate: null, rateWindowStartMs: performance.now(), rateWindowStartSimSeconds: state.simulationTimeSeconds };
  }
  if (pilot || autoflight || route || environment) {
    result.commandRevisions = {
      pilot: state.commandRevisions.pilot + Number(pilot), autoflight: state.commandRevisions.autoflight + Number(autoflight),
      route: state.commandRevisions.route + Number(route), environment: state.commandRevisions.environment + Number(environment),
    };
    result.commandAcceptedAtMs = performance.now();
  }
  if (epochChanged) {
    result.asyncPhysicsGeneration = Math.max(state.asyncPhysicsGeneration + 1, patch.asyncPhysicsGeneration ?? 0);
    result.asyncPhysicsInFlight = false;
    result.asyncReservedSteps = 0;
    if (fence && state.asyncPhysicsInFlight && (patch.status ?? state.status) === 'running' && patch.fixedStepAccumulatorSeconds === undefined) {
      result.fixedStepAccumulatorSeconds = state.fixedStepAccumulatorSeconds + state.asyncReservedSteps / 60;
    }
  }
  if (patch.simulationTimeSeconds !== undefined || (patch.status === 'stopped' && state.status !== 'stopped')) result.simulationCommit = null;
  return result;
}
