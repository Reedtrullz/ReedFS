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
