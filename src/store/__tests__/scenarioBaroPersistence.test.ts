import { beforeEach, describe, expect, it } from 'vitest';
import { KSEA_TUTORIAL_SCENARIO } from '../../sim/scenarios';
import { createScenarioSnapshot, saveScenarioSnapshot, loadScenarioSnapshot, SCENARIO_SAVE_KEY } from '../scenarioPersistence';
import { useSimStore } from '../simStore';
import { useBaroStore, type BaroSetting } from '../baroStore';
import { restoreSnapshotSlice } from '../slices/persistenceSlice';

function memoryStorage() {
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

describe('scenario persistence barometric setting', () => {
  beforeEach(() => {
    useSimStore.getState().discardPendingScenarioSave();
    useSimStore.getState().setScenario(KSEA_TUTORIAL_SCENARIO.id);
    useSimStore.getState().reset();
    useBaroStore.setState({ setting: { mode: 'qnh', qnhHpa: 1013.25, unit: 'hPa' } });
  });

  it('snapshots carry the barometric knob and reject an invalid one on load', () => {
    useBaroStore.getState().setQnhHpa(990);
    const snapshot = createScenarioSnapshot(useSimStore.getState());
    expect(snapshot.baroSetting).toEqual({ mode: 'qnh', qnhHpa: 990, unit: 'hPa' });

    const storage = memoryStorage();
    saveScenarioSnapshot(storage, snapshot);
    expect(storage.getItem(SCENARIO_SAVE_KEY)).toContain('baroSetting');
    const loaded = loadScenarioSnapshot(storage);
    expect(loaded.ok).toBe(true);

    const tampered = structuredClone(snapshot);
    (tampered.baroSetting as BaroSetting).qnhHpa = 600;
    const bad = loadScenarioSnapshot({
      getItem: () => JSON.stringify({ version: 3, slots: { default: { name: 'default', snapshot: tampered } } }),
      getItem2: undefined,
    } as unknown as Storage);
    expect(bad.ok).toBe(false);
  });

  it('restore reinstates the saved knob exactly, including STD mode and unit', () => {
    useBaroStore.getState().setQnhHpa(1003);
    useBaroStore.getState().setMode('std');
    useBaroStore.getState().setUnit('inHg');
    const snapshot = createScenarioSnapshot(useSimStore.getState());
    expect(snapshot.baroSetting).toEqual({ mode: 'std', qnhHpa: 1003, unit: 'inHg' });

    useBaroStore.setState({ setting: { mode: 'qnh', qnhHpa: 1013.25, unit: 'hPa' } });
    useSimStore.getState().setScenario('enva-tutorial');
    const fresh = useBaroStore.getState().setting;
    expect(fresh.qnhHpa).toBe(1013.25);
    restoreSnapshotSlice(snapshot);
    expect(useBaroStore.getState().setting).toEqual({ mode: 'std', qnhHpa: 1003, unit: 'inHg' });
  });
});
