import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultAutopilotState } from '../../instruments/defaultAutopilotState';
import { createAutopilotControllerState } from '../../sim/systems/autopilot';
import { createKseaKpdxFlight } from '../../sim/flightPlanLoader';
import { KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO } from '../../sim/scenarios';
import {
  SCENARIO_SAVE_KEY,
  createScenarioSnapshot,
  loadScenarioSnapshot,
  saveScenarioSnapshot,
} from '../scenarioPersistence';
import { useSimStore } from '../simStore';

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => { entries.delete(key); },
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
}

describe('scenario persistence', () => {
  beforeEach(() => {
    useSimStore.getState().setScenario(KSEA_TUTORIAL_SCENARIO.id);
    useSimStore.getState().reset();
  });

  it('serializes only cloneable sim state', () => {
    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    useSimStore.getState().setInput({ throttle1: 0.42, throttle2: 0.42 });

    const snapshot = createScenarioSnapshot(useSimStore.getState());
    const roundTripped = JSON.parse(JSON.stringify(snapshot));

    expect(roundTripped).toEqual(snapshot);
    expect(Object.keys(snapshot)).not.toContain('tick');
    expect(Object.keys(snapshot)).not.toContain('setInput');
    expect(snapshot.selectedScenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(snapshot.apControllerState).toEqual(createAutopilotControllerState());
  });

  it('saves and loads a valid snapshot from storage', () => {
    const storage = memoryStorage();
    const snapshot = createScenarioSnapshot(useSimStore.getState());

    saveScenarioSnapshot(storage, snapshot);
    const loaded = loadScenarioSnapshot(storage);

    expect(storage.getItem(SCENARIO_SAVE_KEY)).toContain('selectedScenarioId');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.snapshot).toEqual(snapshot);
    }
  });

  it('persists named slots with scenario, route, phase, timestamp, and restore metadata', () => {
    const storage = memoryStorage();
    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    useSimStore.getState().setFlightPlan(createKseaKpdxFlight());
    useSimStore.getState().startTakeoffRoll();
    const snapshot = createScenarioSnapshot(useSimStore.getState());

    saveScenarioSnapshot(storage, snapshot, {
      slotId: 'pattern-practice',
      slotName: 'Pattern Practice',
      overwrite: true,
    });

    const saved = JSON.parse(storage.getItem(SCENARIO_SAVE_KEY) ?? 'null');
    expect(saved.version).toBe(3);
    expect(saved.slots['pattern-practice'].metadata).toEqual(expect.objectContaining({
      id: 'pattern-practice',
      name: 'Pattern Practice',
      selectedScenarioId: KSEA_LIGHT_PATTERN_SCENARIO.id,
      status: 'running',
      restoreStatus: 'paused',
      routeSummary: 'KSEA → KPDX',
    }));
    expect(saved.slots['pattern-practice'].metadata.savedAtIso).toEqual(expect.any(String));
  });

  it('loads named slots independently and restores running saves paused', () => {
    const storage = memoryStorage();
    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    useSimStore.getState().startTakeoffRoll();
    useSimStore.getState().saveScenarioState(storage, {
      slotId: 'pattern-practice',
      slotName: 'Pattern Practice',
      overwrite: true,
    });

    useSimStore.getState().setScenario(KSEA_TUTORIAL_SCENARIO.id);
    useSimStore.getState().saveScenarioState(storage, {
      slotId: 'gate-setup',
      slotName: 'Gate Setup',
      overwrite: true,
    });

    useSimStore.getState().loadScenarioState(storage, 'pattern-practice');
    const restored = useSimStore.getState();

    expect(restored.selectedScenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(restored.status).toBe('paused');
    expect(restored.scenarioPersistenceMessage).toMatch(/Pattern Practice/);
  });

  it('migrates legacy single-slot saves to the default named slot', () => {
    const storage = memoryStorage();
    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    const legacySnapshot = createScenarioSnapshot(useSimStore.getState());
    storage.setItem(SCENARIO_SAVE_KEY, JSON.stringify(legacySnapshot));

    const loaded = loadScenarioSnapshot(storage, 'default');
    expect(storage.getItem(SCENARIO_SAVE_KEY)).toBe(JSON.stringify(legacySnapshot));
    saveScenarioSnapshot(storage, createScenarioSnapshot(useSimStore.getState()), { slotId: 'second-slot' });
    const migrated = JSON.parse(storage.getItem(SCENARIO_SAVE_KEY) ?? 'null');

    expect(loaded.ok).toBe(true);
    expect(migrated.version).toBe(3);
    expect(migrated.slots['second-slot']).toBeDefined();
    expect(migrated.slots.default.metadata).toEqual(expect.objectContaining({
      id: 'default',
      name: 'Default save',
      selectedScenarioId: KSEA_LIGHT_PATTERN_SCENARIO.id,
    }));
  });

  it('store load restores aircraft, inputs, route, AP state, wind, and scenario id', () => {
    const storage = memoryStorage();
    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    useSimStore.getState().setInput({ throttle1: 0.35, throttle2: 0.35, elevator: -0.12 });
    useSimStore.getState().setFlightPlan(createKseaKpdxFlight());
    const ap = createDefaultAutopilotState();
    ap.truth.autopilotStatus = 'CMD_A';
    useSimStore.getState().setApState(ap);
    useSimStore.getState().saveScenarioState(storage);

    useSimStore.getState().setScenario(KSEA_TUTORIAL_SCENARIO.id);
    expect(useSimStore.getState().selectedScenarioId).toBe(KSEA_TUTORIAL_SCENARIO.id);

    useSimStore.getState().loadScenarioState(storage);
    const restored = useSimStore.getState();

    expect(restored.selectedScenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(restored.aircraft.position.lat).toBeCloseTo(KSEA_LIGHT_PATTERN_SCENARIO.position.lat, 8);
    expect(restored.pilotInputs.throttle1).toBe(0.35);
    expect(restored.effectiveControls.elevator).toBe(-0.12);
    expect(restored.flightPlan?.origin).toBe('KSEA');
    expect(restored.apState?.truth.autopilotStatus).toBe('CMD_A');
    expect(restored.apControllerState).toEqual(createAutopilotControllerState());
    expect(restored.wind).toEqual(KSEA_LIGHT_PATTERN_SCENARIO.wind);
  });

  it('serializes and restores AP controller state explicitly', () => {
    const storage = memoryStorage();
    const snapshot = createScenarioSnapshot(useSimStore.getState());
    snapshot.apControllerState = {
      ...createAutopilotControllerState(),
      throttleLimited: 0.42,
      thrustPid: { value: 1.25, prevError: -3.5 },
    };

    saveScenarioSnapshot(storage, snapshot);
    useSimStore.getState().loadScenarioState(storage);

    expect(useSimStore.getState().apControllerState.throttleLimited).toBe(0.42);
    expect(useSimStore.getState().apControllerState.thrustPid).toEqual({ value: 1.25, prevError: -3.5 });
  });

  it('loads saved running states paused for repeatable training loops', () => {
    const storage = memoryStorage();
    useSimStore.getState().startTakeoffRoll();
    expect(useSimStore.getState().status).toBe('running');

    useSimStore.getState().saveScenarioState(storage);
    useSimStore.getState().reset();
    useSimStore.getState().loadScenarioState(storage);

    expect(useSimStore.getState().status).toBe('paused');
    expect(useSimStore.getState().scenarioPersistenceMessage).toMatch(/paused/i);
  });

  it('ignores corrupt saved data with a visible reason', () => {
    const storage = memoryStorage();
    storage.setItem(SCENARIO_SAVE_KEY, '{definitely not json');

    const loaded = loadScenarioSnapshot(storage);
    useSimStore.getState().loadScenarioState(storage);

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.reason).toMatch(/invalid/i);
    expect(useSimStore.getState().scenarioPersistenceMessage).toMatch(/ignored/i);
  });
});

describe('save trust boundary regressions', () => {
  beforeEach(() => { useSimStore.getState().setScenario(KSEA_TUTORIAL_SCENARIO.id); useSimStore.getState().reset(); });
  it('restores the effective atmosphere and pauses a running flight', () => {
    const storage = memoryStorage();
    const weather = { ...KSEA_TUTORIAL_SCENARIO.weather, qnhHpa: 850, surfaceTemperatureC: 42, visibilityM: 900 };
    useSimStore.setState({ weather, status: 'running' });
    useSimStore.getState().saveScenarioState(storage);
    useSimStore.getState().reset(); useSimStore.getState().loadScenarioState(storage);
    expect(useSimStore.getState().weather).toEqual(weather);
    expect(useSimStore.getState().status).toBe('paused');
  });
  it.each(['{broken', '{"version":99,"slots":{}}'])('preserves an unreadable collection instead of overwriting it: %s', (raw) => {
    const storage = memoryStorage(); storage.setItem(SCENARIO_SAVE_KEY, raw);
    expect(() => saveScenarioSnapshot(storage, createScenarioSnapshot(useSimStore.getState()), { slotId: 'new-slot' })).toThrow();
    expect(storage.getItem(SCENARIO_SAVE_KEY)).toBe(raw);
  });
  it.each([
    (x: Record<string, unknown>) => { x.aircraft = {}; },
    (x: Record<string, unknown>) => { x.pilotInputs = { throttle1: 4 }; },
    (x: Record<string, unknown>) => { x.selectedScenarioId = 'unknown'; },
    (x: Record<string, unknown>) => { x.status = 'unknown'; },
    (x: Record<string, unknown>) => { x.activeLegIndex = -1; },
    (x: Record<string, unknown>) => { x.simulationTimeSeconds = 'not-time'; },
  ])('rejects malformed saved state without altering the active aircraft', (corrupt) => {
    const storage = memoryStorage(); const snapshot = createScenarioSnapshot(useSimStore.getState());
    saveScenarioSnapshot(storage, snapshot);
    const parsed = JSON.parse(storage.getItem(SCENARIO_SAVE_KEY)!);
    corrupt(parsed.slots.default.snapshot); storage.setItem(SCENARIO_SAVE_KEY, JSON.stringify(parsed));
    const before = structuredClone(useSimStore.getState().aircraft);
    expect(loadScenarioSnapshot(storage).ok).toBe(false);
    useSimStore.getState().loadScenarioState(storage);
    expect(useSimStore.getState().aircraft).toEqual(before);
  });
  it('refuses a new save containing nonfinite values', () => {
    const snapshot = createScenarioSnapshot(useSimStore.getState()); snapshot.aircraft.velocity.u = NaN;
    expect(() => saveScenarioSnapshot(memoryStorage(), snapshot)).toThrow();
  });
  it('keeps the previous collection when quota blocks a new save', () => {
    const storage = memoryStorage(); saveScenarioSnapshot(storage, createScenarioSnapshot(useSimStore.getState()));
    const before = storage.getItem(SCENARIO_SAVE_KEY);
    storage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    useSimStore.getState().saveScenarioState(storage, { slotId: 'quota-slot' });
    expect(storage.getItem(SCENARIO_SAVE_KEY)).toBe(before);
    expect(useSimStore.getState().scenarioPersistenceMessage).toMatch(/failed/i);
  });
  it('contains denied reads rather than throwing from store actions', () => {
    const storage = memoryStorage(); storage.getItem = () => { throw new DOMException('denied', 'SecurityError'); };
    expect(() => useSimStore.getState().loadScenarioState(storage)).not.toThrow();
    expect(() => useSimStore.getState().saveScenarioState(storage)).not.toThrow();
    expect(() => useSimStore.getState().refreshScenarioSaveSlots(storage)).not.toThrow();
  });
});

it('rejects unsupported saved contract identities', () => {
  const storage = memoryStorage(); const snapshot = createScenarioSnapshot(useSimStore.getState());
  saveScenarioSnapshot(storage, snapshot); const parsed = JSON.parse(storage.getItem(SCENARIO_SAVE_KEY)!);
  parsed.slots.default.snapshot.identities = { aircraft: 'different-pack', sharedCommit: 'different-commit' };
  storage.setItem(SCENARIO_SAVE_KEY, JSON.stringify(parsed));
  expect(loadScenarioSnapshot(storage).ok).toBe(false);
});
