import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '../simStore';
import { createScenarioSnapshot, loadScenarioSnapshot, saveScenarioSnapshot, SCENARIO_SAVE_KEY } from '../scenarioPersistence';

beforeEach(() => { localStorage.clear(); useSimStore.getState().discardPendingScenarioSave(); useSimStore.getState().reset(); });

describe('engine fuel command persistence', () => {
  it('restores independent cutoff commands paused without changing throttle or silently reopening fuel', () => {
    useSimStore.getState().start();
    useSimStore.getState().setInput({ throttle1: 0.8, throttle2: 0.2, fuelCutoff1: true, fuelCutoff2: false });
    saveScenarioSnapshot(localStorage, createScenarioSnapshot(useSimStore.getState()));
    useSimStore.getState().reset();
    useSimStore.getState().loadScenarioState(localStorage);
    const state = useSimStore.getState();
    expect(state.status).toBe('paused');
    expect(state.pilotInputs).toMatchObject({ throttle1: 0.8, throttle2: 0.2, fuelCutoff1: true, fuelCutoff2: false });
    expect(state.effectiveControls.fuelCutoff1).toBe(true);
  });

  it('accepts old saves with absent cutoff fields, normalizes fuel on and preserves original bytes', () => {
    const snapshot = createScenarioSnapshot(useSimStore.getState());
    delete snapshot.pilotInputs.fuelCutoff1; delete snapshot.pilotInputs.fuelCutoff2;
    saveScenarioSnapshot(localStorage, snapshot);
    const before = localStorage.getItem(SCENARIO_SAVE_KEY);
    useSimStore.getState().setInput({ fuelCutoff1: true, fuelCutoff2: true });
    useSimStore.getState().loadScenarioState(localStorage);
    expect(useSimStore.getState().pilotInputs).toMatchObject({ fuelCutoff1: false, fuelCutoff2: false });
    expect(localStorage.getItem(SCENARIO_SAVE_KEY)).toBe(before);
  });

  it('rejects a malformed cutoff command without rewriting the invalid save', () => {
    const snapshot = createScenarioSnapshot(useSimStore.getState());
    const raw = JSON.stringify({ ...snapshot, pilotInputs: { ...snapshot.pilotInputs, fuelCutoff2: 'false' } });
    localStorage.setItem(SCENARIO_SAVE_KEY, raw);
    expect(loadScenarioSnapshot(localStorage).ok).toBe(false);
    expect(localStorage.getItem(SCENARIO_SAVE_KEY)).toBe(raw);
  });
});
