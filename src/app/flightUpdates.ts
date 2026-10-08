import { captureScenarioSnapshot, loadScenarioSnapshot, type ScenarioSnapshot } from '../store/scenarioPersistence';
import { useSimStore } from '../store/simStore';
import { applySavedFlightUpdate } from './flightUpdateBoundary';

let updateWorker: ServiceWorker | null = null;
let initialized = false;
let attempt = 0;
let view = { available: false, dismissed: false, busy: false, message: '' };
const listeners = new Set<() => void>();
export const flightUpdates = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => view,
};
function publish(patch: Partial<typeof view>) { view = { ...view, ...patch }; listeners.forEach((listener) => listener()); }
function flightPayload(snapshot: ScenarioSnapshot) { return JSON.stringify({ ...snapshot, savedAtIso: null }); }

async function saveBoundary() {
  const state = useSimStore.getState(); const expected = flightPayload(captureScenarioSnapshot(state));
  const slotId = `update-${crypto.randomUUID()}`;
  const saved = await state.saveScenarioState(undefined, { slotId, slotName: 'Before app update', overwrite: false });
  if (!saved) throw new Error('Saving failed. Existing saves and this flight are preserved; review the save controls.');
  return { isCurrent: () => {
    try {
      const loaded = loadScenarioSnapshot(localStorage, slotId);
      return loaded.ok && flightPayload(loaded.snapshot) === expected && flightPayload(captureScenarioSnapshot(useSimStore.getState())) === expected;
    } catch { return false; }
  } };
}

export function deferFlightUpdate() { attempt++; publish({ dismissed: true, busy: false, message: '' }); }
export function showFlightUpdate() { publish({ dismissed: false }); }
export async function requestFlightUpdate() {
  if (!updateWorker || view.busy) return;
  const worker = updateWorker; const request = ++attempt;
  publish({ busy: true, message: 'Saving this session before updating…' });
  try {
    await applySavedFlightUpdate(worker, { getState: useSimStore.getState, save: saveBoundary,
      cancelled: () => attempt !== request, reload: () => window.location.reload() });
    if (attempt === request) publish({ busy: false });
  } catch (error) {
    if (attempt === request) publish({ busy: false, message: error instanceof Error ? error.message : 'Update unavailable. This flight is preserved.' });
  }
}

export function initializeFlightUpdates() {
  if (initialized || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  initialized = true;
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registration) => {
    const offer = (worker: ServiceWorker | null) => {
      if (!worker || !navigator.serviceWorker.controller) return;
      updateWorker = worker; publish({ available: true, dismissed: false });
    };
    offer(registration.waiting || (registration.active !== navigator.serviceWorker.controller ? registration.active : null));
    const watched = new WeakSet<ServiceWorker>();
    const watchInstalling = () => {
      const installing = registration.installing;
      if (!installing || watched.has(installing)) return;
      watched.add(installing);
      const changed = () => {
        if (installing.state === 'installed') offer(installing);
        if (installing.state === 'activated' || installing.state === 'redundant') installing.removeEventListener('statechange', changed);
      };
      installing.addEventListener('statechange', changed); changed();
    };
    registration.addEventListener('updatefound', watchInstalling); watchInstalling();
  }).catch(() => publish({ message: 'Offline/update registration unavailable.' }));
}
