import type { SimStore } from '../store/simStore';

export type UpdateWorker = Pick<ServiceWorker, 'state' | 'postMessage' | 'addEventListener' | 'removeEventListener'>;
export interface UpdateBoundary {
  getState(): SimStore;
  save(): Promise<{ isCurrent(): boolean }>;
  cancelled(): boolean;
  reload(): void;
}

function canSave(state: SimStore) {
  return state.status !== 'running' && !state.asyncPhysicsInFlight && !state.pendingScenarioSave &&
    (!state.simulationFailure || state.simulationFailure.recovered);
}

export async function applySavedFlightUpdate(worker: UpdateWorker, boundary: UpdateBoundary): Promise<void> {
  if (!canSave(boundary.getState())) throw new Error('Pause and recover the flight before updating.');
  const receipt = await boundary.save();
  if (boundary.cancelled()) return;
  const unchanged = () => canSave(boundary.getState()) && receipt.isCurrent();
  if (!unchanged()) throw new Error('The saved flight changed. Save again before updating.');
  if (worker.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); worker.removeEventListener('statechange', changed); };
      const changed = () => {
        if (worker.state === 'activated') { cleanup(); resolve(); }
        else if (worker.state === 'redundant') { cleanup(); reject(new Error('Update unavailable. Flight preserved.')); }
      };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Update activation timed out. Flight preserved.')); }, 10000);
      worker.addEventListener('statechange', changed);
      try { worker.postMessage({ type: 'SKIP_WAITING' }); changed(); }
      catch { cleanup(); reject(new Error('Update activation unavailable. Flight preserved.')); }
    });
  }
  if (boundary.cancelled()) return;
  if (!unchanged()) throw new Error('The saved flight changed during activation. Continue this flight or save again.');
  boundary.reload();
}
