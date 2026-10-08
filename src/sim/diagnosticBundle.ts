import type { SimStore } from '../store/simStore';
import { computeDerived } from './physics/derived';
import { SCENARIO_SNAPSHOT_IDENTITIES } from '../store/scenarioPersistence';
import { APP_BUILD_COHORT } from '../config/buildIdentity';
import { getSimulationRuntime } from './simulationRuntime';
import { SIMULATION_WORKER_PROTOCOL_VERSION } from './workerCodec';

export const MAX_DIAGNOSTIC_BYTES = 8192;
function number(value: number | undefined, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  return Number.isFinite(value) && value! >= min && value! <= max ? value! : null;
}

/** Only these explicit fields can enter a general sharing bundle. No error traversal. */
export function captureDiagnosticSnapshot(state: SimStore, options: { nowMs: number; uiFailure?: boolean }) {
  const commit = state.simulationCommit;
  const runtime = getSimulationRuntime(); const configuredBackend = runtime.kind;
  const health = runtime.diagnosticState?.();
  const observed = commit?.observation ?? state;
  const air = computeDerived(observed.aircraft, observed.wind, observed.weather);
  return {
    bundle: {
      schema: 'rfs-diagnostic/v1', capturedAtUtc: new Date().toISOString(),
      identities: { ...SCENARIO_SNAPSHOT_IDENTITIES, appCohort: APP_BUILD_COHORT,
        workerProtocol: SIMULATION_WORKER_PROTOCOL_VERSION, observedWorkerCohort: health?.observedWorkerCohort === APP_BUILD_COHORT ? APP_BUILD_COHORT : 'unavailable' },
      runtime: {
        status: ['stopped', 'running', 'paused'].includes(state.status) ? state.status : 'unavailable',
        configuredBackend: ['main-thread', 'browser-worker', 'worker-handler-parity'].includes(configuredBackend) ? configuredBackend : 'unavailable',
        lastValidatedBackend: health?.executionBackend && ['main-thread', 'browser-worker', 'worker-handler-parity'].includes(health.executionBackend) ? health.executionBackend : 'unavailable',
        requestedRate: number(state.simRate, 1, 64), achievedRate: number(commit?.achievedSimRate ?? undefined),
        simulationSeconds: number(state.simulationTimeSeconds), droppedSeconds: number(state.droppedSimulationTimeSeconds),
        stepIndex: number(commit?.stepIndex), ageMs: commit ? number(Math.max(0, options.nowMs - commit.committedAtMs)) : null,
        batchMs: number(commit?.batchDurationMs), latestCommandMs: number(commit?.commandLatencyMs),
        workerInFlight: Boolean(state.asyncPhysicsInFlight),
      },
      airData: { quantity: 'ideal-ias-equals-cas', valid: air.airDataValid, tasKt: number(air.tas), gsKt: number(air.gs), easKt: number(air.eas),
        casKt: number(air.cas ?? undefined), iasKt: air.airDataValid ? number(air.ias) : null, mach: number(air.mach) },
      fault: { present: Boolean(state.simulationFailure), recovered: Boolean(state.simulationFailure?.recovered),
        checkpointAvailable: Boolean(state.lastValidCheckpoint), uiFailure: Boolean(options.uiFailure) },
      omissions: ['raw-errors', 'credentials', 'names', 'route', 'owner-identifiers', 'replay-state'],
    },
    position: { latitude: number(state.aircraft.position.lat, -90, 90), longitude: number(state.aircraft.position.lon, -180, 180),
      altitudeFt: number(state.aircraft.position.alt, -2000, 1000000) },
  };
}

export function serializeDiagnosticBundle(snapshot: ReturnType<typeof captureDiagnosticSnapshot>, includePosition: boolean): string {
  const payload = JSON.stringify({ ...snapshot.bundle, ...(includePosition ? { position: snapshot.position } : {}) }, null, 2);
  if (new TextEncoder().encode(payload).length > MAX_DIAGNOSTIC_BYTES) throw new Error('Diagnostic size limit exceeded');
  return payload;
}
