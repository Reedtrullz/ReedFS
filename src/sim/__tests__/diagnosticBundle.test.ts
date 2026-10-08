import { SIMULATION_WORKER_PROTOCOL_VERSION } from '../workerCodec';
import { afterEach, expect, it } from 'vitest';
import { useSimStore } from '../../store/simStore';
import { captureDiagnosticSnapshot, serializeDiagnosticBundle, MAX_DIAGNOSTIC_BYTES } from '../diagnosticBundle';

afterEach(() => useSimStore.getState().reset());

it('exports useful whitelisted metrics while excluding planted names/tokens and recursive errors', () => {
  useSimStore.getState().reset(); useSimStore.getState().start(); useSimStore.getState().pause();
  const state = useSimStore.getState(); const cycle: Record<string, unknown> = { token: 'PLANTED_PRIVATE_TOKEN', name: 'PLANTED_PERSON_NAME' }; cycle.self = cycle;
  const polluted = { ...state, simulationFailure: { message: 'PLANTED_PRIVATE_TOKEN PLANTED_PERSON_NAME', detectedAtIso: '2026-10-08T00:00:00Z', input: cycle, result: cycle, recovered: false, checkpoint: null } };
  const snapshot = captureDiagnosticSnapshot(polluted, { nowMs: 1000 }); const payload = serializeDiagnosticBundle(snapshot, false);
  const bundle = JSON.parse(payload);
  expect(bundle.schema).toBe('rfs-diagnostic/v1'); expect(bundle.runtime.status).toBe('paused');
  expect(bundle.identities.workerProtocol).toBe(SIMULATION_WORKER_PROTOCOL_VERSION); expect(bundle.fault.present).toBe(true);
  expect(payload).not.toMatch(/PLANTED_|latitude|longitude|flightNumber|input|stack/);
  expect(new TextEncoder().encode(payload).length).toBeLessThan(MAX_DIAGNOSTIC_BYTES);
  expect(bundle.airData.quantity).toBe('ideal-ias-equals-cas'); expect(bundle.airData.valid).toBe(true);
  expect(bundle.airData.iasKt).toBe(bundle.airData.casKt);
  expect(useSimStore.getState()).toBe(state);
});

it('location is opt-in and captured once; invalid numeric fields stay data', () => {
  useSimStore.getState().reset(); const state = useSimStore.getState();
  const snapshot = captureDiagnosticSnapshot(state, { nowMs: 1000 });
  const defaultBundle = JSON.parse(serializeDiagnosticBundle(snapshot, false)); expect(defaultBundle.position).toBeUndefined();
  const withPosition = JSON.parse(serializeDiagnosticBundle(snapshot, true)); expect(withPosition.position.latitude).toBe(state.aircraft.position.lat);
  useSimStore.getState().setScenario('ksea-tutorial');
  expect(JSON.parse(serializeDiagnosticBundle(snapshot, true))).toEqual(withPosition);
  const invalid = captureDiagnosticSnapshot({ ...state, aircraft: { ...state.aircraft, position: { lat: NaN, lon: Infinity, alt: -Infinity } } }, { nowMs: 1000 });
  expect(JSON.parse(serializeDiagnosticBundle(invalid, true)).position).toEqual({ latitude: null, longitude: null, altitudeFt: null });
});

it('enforces the UTF-8 payload cap before downloading', () => {
  const snapshot = captureDiagnosticSnapshot(useSimStore.getState(), { nowMs: 1000 });
  snapshot.bundle.identities.appCohort = 'x'.repeat(MAX_DIAGNOSTIC_BYTES);
  expect(() => serializeDiagnosticBundle(snapshot, false)).toThrow(/size limit/);
});
