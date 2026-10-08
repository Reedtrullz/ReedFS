import { beforeEach, describe, expect, it } from 'vitest';
import legacyV3 from './fixtures/scenario-v3-before-utc.json';
import { useSimStore } from '../simStore';
import { createScenarioSnapshot, loadScenarioSnapshot, saveScenarioSnapshot, SCENARIO_SAVE_KEY } from '../scenarioPersistence';
import { DEFAULT_SCENARIO_UTC_MS, LEGACY_SCENARIO_MIDNIGHT_MS, scenarioUtcMs } from '../../sim/scenarioClock';
import { createKseaKpdxFlight } from '../../sim/flightPlanLoader';
import { KSEA_RUNWAY_16L } from '../../viewport/runwayData';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
beforeEach(() => { useSimStore.getState().setScenario('ksea-tutorial'); useSimStore.getState().discardPendingScenarioSave(); });

describe('UTC save and replacement boundaries', () => {
  it.each([1, 2, 3])('migrates a representative valid old version%s read-only with an explicit clock warning', (version) => {
    const storage = memoryStorage(); const old = structuredClone(legacyV3) as Record<string, unknown>;
    old.version = version;
    if (version < 3) { delete old.identities; delete old.weather; }
    if (version === 1) delete old.apControllerState;
    const raw = JSON.stringify(old); storage.setItem(SCENARIO_SAVE_KEY, raw);
    const loaded = loadScenarioSnapshot(storage); expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(() => saveScenarioSnapshot(storage, loaded.snapshot, { slotId: 'copy' })).toThrow('Invalid scenario snapshot');
    useSimStore.getState().loadScenarioState(storage);
    const state = useSimStore.getState();
    expect(scenarioUtcMs(state.aircraft)).toBeCloseTo(LEGACY_SCENARIO_MIDNIGHT_MS + legacyV3.aircraft.timeOfDay * 3_600_000, 3);
    expect(state.aircraft.simTime).toBe(legacyV3.aircraft.simTime);
    expect(state.scenarioPersistenceMessage).toContain('Legacy clock mapped');
    expect(storage.getItem(SCENARIO_SAVE_KEY)).toBe(raw);
    expect(state.status).toBe('paused');
  });

  it('preserves a legacy neighbor while writing a current clock/atmosphere snapshot', () => {
    const storage = memoryStorage(); const old = JSON.stringify(legacyV3); storage.setItem(SCENARIO_SAVE_KEY, old);
    useSimStore.getState().setScenarioUtc('2026-12-31T23:59:59Z');
    useSimStore.getState().start(); useSimStore.getState().tick(16); useSimStore.getState().tick(116); useSimStore.getState().pause();
    const snapshot = createScenarioSnapshot(useSimStore.getState()); expect(snapshot.version).toBe(4);
    expect(snapshot.identities).toMatchObject({ clock: 'utc-epoch-ms/committed-sim-time-ms/v2', atmosphere: 'ussa-1976-lower-atmosphere/1.0.0' });
    saveScenarioSnapshot(storage, snapshot, { slotId: 'new' });
    const collection = JSON.parse(storage.getItem(SCENARIO_SAVE_KEY)!);
    expect(collection.slots.default.snapshot).toEqual(legacyV3);
    expect(collection.slots.new.snapshot).toEqual(snapshot);
    useSimStore.getState().reset(); useSimStore.getState().loadScenarioState(storage, 'new');
    expect(useSimStore.getState().aircraft).toEqual(snapshot.aircraft);
    expect(useSimStore.getState().weather).toEqual(snapshot.weather);
    expect(scenarioUtcMs(useSimStore.getState().aircraft)).toBe(scenarioUtcMs(snapshot.aircraft));
    expect(useSimStore.getState().scenarioPersistenceMessage).not.toContain('Legacy clock mapped');
  });

  it('keeps chosen UTC through runway replacement at nonzero simulation time', () => {
    useSimStore.getState().setScenarioUtc('2026-12-31T23:59:59Z');
    useSimStore.getState().start(); useSimStore.getState().tick(16); useSimStore.getState().tick(116); useSimStore.getState().pause();
    const before = scenarioUtcMs(useSimStore.getState().aircraft);
    expect(useSimStore.getState().aircraft.simTime).toBeGreaterThan(0);
    useSimStore.getState().setFlightPlanAtRunway(createKseaKpdxFlight(), KSEA_RUNWAY_16L);
    expect(useSimStore.getState().aircraft.simTime).toBe(0);
    expect(scenarioUtcMs(useSimStore.getState().aircraft)).toBe(before);
    useSimStore.getState().reset(); expect(scenarioUtcMs(useSimStore.getState().aircraft)).toBe(DEFAULT_SCENARIO_UTC_MS);
  });

  it.each(['2026-02-31T12:00Z', '2101-01-01T00:00Z', '2026-09-24T12:00', 'invalid'])('rejects UTC edit%s without changing flight/weather', (text) => {
    const before = createScenarioSnapshot(useSimStore.getState()); const generation = useSimStore.getState().asyncPhysicsGeneration;
    expect(useSimStore.getState().setScenarioUtc(text)).toBe(false);
    const after = createScenarioSnapshot(useSimStore.getState()); after.savedAtIso = before.savedAtIso;
    expect(after).toEqual(before); expect(useSimStore.getState().asyncPhysicsGeneration).toBe(generation);
  });

  it('refuses running edits and fences paused UTC replacement', () => {
    useSimStore.getState().start(); const running = useSimStore.getState().aircraft;
    expect(useSimStore.getState().setScenarioUtc('2026-10-01T00:00Z')).toBe(false);
    expect(useSimStore.getState().aircraft).toBe(running);
    useSimStore.getState().pause(); const generation = useSimStore.getState().asyncPhysicsGeneration;
    useSimStore.setState({ asyncPhysicsInFlight: true, asyncReservedSteps: 16 });
    expect(useSimStore.getState().setScenarioUtc('2026-10-01T00:00Z')).toBe(true);
    expect(useSimStore.getState().asyncPhysicsGeneration).toBe(generation + 1);
    expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false);
    expect(useSimStore.getState().asyncReservedSteps).toBe(0);
  });

  it.each(['clock', 'atmosphere'])('rejects incompatible v4%s identity without mutating saved bytes or aircraft', (identity) => {
    const storage = memoryStorage(); const snapshot = createScenarioSnapshot(useSimStore.getState());
    (snapshot.identities as unknown as Record<string, unknown>)[identity] = 'future';
    const raw = JSON.stringify(snapshot); storage.setItem(SCENARIO_SAVE_KEY, raw); const before = useSimStore.getState().aircraft;
    useSimStore.getState().loadScenarioState(storage);
    expect(useSimStore.getState().aircraft).toBe(before); expect(storage.getItem(SCENARIO_SAVE_KEY)).toBe(raw);
    expect(loadScenarioSnapshot(storage).ok).toBe(false);
  });

  it.each(['missing-anchor', 'incoherent-hours', 'future-version', 'foreign-v3-clock'])('preserves and refuses incompatible saved clock %s', (kind) => {
    const storage = memoryStorage();
    const snapshot = structuredClone(kind === 'foreign-v3-clock' ? legacyV3 : createScenarioSnapshot(useSimStore.getState())) as unknown as Record<string, unknown>;
    const aircraft = snapshot.aircraft as Record<string, unknown>;
    if (kind === 'missing-anchor') delete aircraft.utcEpochMs;
    if (kind === 'incoherent-hours') aircraft.timeOfDay = 14;
    if (kind === 'future-version') snapshot.version = 5;
    if (kind === 'foreign-v3-clock') (snapshot.identities as Record<string, unknown>).clock = 'future';
    const raw = JSON.stringify(snapshot); storage.setItem(SCENARIO_SAVE_KEY, raw);
    const before = useSimStore.getState().aircraft;
    useSimStore.getState().loadScenarioState(storage);
    expect(useSimStore.getState().aircraft).toBe(before);
    expect(storage.getItem(SCENARIO_SAVE_KEY)).toBe(raw);
    expect(loadScenarioSnapshot(storage).ok).toBe(false);
  });
});
