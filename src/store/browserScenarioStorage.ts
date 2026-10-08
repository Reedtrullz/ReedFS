import type { ScenarioPersistenceStorage } from './scenarioPersistence';

export const SCENARIO_SAVE_LOCK = 'rfs-scenario-saves';

/** All product browser writes read and write inside this origin-wide lock. */
export async function withBrowserScenarioSaveLock(operation: (storage: ScenarioPersistenceStorage) => void): Promise<void> {
  if (typeof window !== 'undefined' && window.name === 'rfs-companion') throw new Error('Companion windows cannot write saves');
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Safe saving unavailable: this browser does not support save locks; export the pending save');
  await navigator.locks.request(SCENARIO_SAVE_LOCK, { mode: 'exclusive' }, () => {
    const storage = globalThis.localStorage;
    if (!storage) throw new Error('localStorage is not available');
    operation(storage);
  });
}
