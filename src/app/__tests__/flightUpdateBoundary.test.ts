import { afterEach, expect, it, vi } from 'vitest';
import { useSimStore } from '../../store/simStore';
import { applySavedFlightUpdate, type UpdateWorker } from '../flightUpdateBoundary';

class WaitingWorker extends EventTarget {
  state: ServiceWorkerState = 'installed';
  postMessage = vi.fn(() => {});
  activate() { this.state = 'activated'; this.dispatchEvent(new Event('statechange')); }
}
afterEach(() => { useSimStore.getState().reset(); vi.restoreAllMocks(); });
function fixture() {
  useSimStore.getState().reset(); useSimStore.getState().start(); useSimStore.getState().pause();
  const worker = new WaitingWorker(); let current = true; let cancelled = false;
  const boundary = { getState: useSimStore.getState, save: vi.fn(async () => ({ isCurrent: () => current })),
    cancelled: () => cancelled, reload: vi.fn() };
  return { worker: worker as UpdateWorker & WaitingWorker, boundary, invalidate: () => { current = false; }, cancel: () => { cancelled = true; } };
}
it('refuses active flight before saving or activating', async () => {
  const { worker, boundary } = fixture(); useSimStore.getState().resume();
  await expect(applySavedFlightUpdate(worker, boundary)).rejects.toThrow(/pause/i);
  expect(boundary.save).not.toHaveBeenCalled(); expect(worker.postMessage).not.toHaveBeenCalled();
});
it('refuses a changed or failed save without activating or reloading', async () => {
  const { worker, boundary, invalidate } = fixture(); invalidate();
  await expect(applySavedFlightUpdate(worker, boundary)).rejects.toThrow(/saved/i);
  expect(worker.postMessage).not.toHaveBeenCalled(); expect(boundary.reload).not.toHaveBeenCalled();
});
it('a denied save leaves the flight and previous authority intact', async () => {
  const { worker, boundary } = fixture(); const state = useSimStore.getState();
  boundary.save.mockRejectedValue(new Error('save denied'));
  await expect(applySavedFlightUpdate(worker, boundary)).rejects.toThrow('save denied');
  expect(worker.postMessage).not.toHaveBeenCalled(); expect(boundary.reload).not.toHaveBeenCalled(); expect(useSimStore.getState()).toBe(state);
});
it('cancellation while saving leaves current authority untouched', async () => {
  const { worker, boundary, cancel } = fixture(); const state = useSimStore.getState();
  let release!: () => void; boundary.save.mockImplementation(async () => { await new Promise<void>((resolve) => { release = resolve; }); return { isCurrent: () => true }; });
  const pending = applySavedFlightUpdate(worker, boundary); cancel(); if (release) release();
  await pending; expect(worker.postMessage).not.toHaveBeenCalled(); expect(boundary.reload).not.toHaveBeenCalled(); expect(useSimStore.getState()).toBe(state);
});
it('activation never reloads a resumed or modified flight', async () => {
  const { worker, boundary, invalidate } = fixture();
  worker.postMessage.mockImplementation(() => { useSimStore.getState().resume(); invalidate(); worker.activate(); });
  await expect(applySavedFlightUpdate(worker, boundary)).rejects.toThrow(/saved/i);
  expect(boundary.reload).not.toHaveBeenCalled(); expect(useSimStore.getState().status).toBe('running');
});
it('cancellation after the activation request still preserves the unsaved current flight', async () => {
  const { worker, boundary, cancel } = fixture(); const state = useSimStore.getState();
  const pending = applySavedFlightUpdate(worker, boundary); await Promise.resolve();
  expect(worker.postMessage).toHaveBeenCalledTimes(1); cancel(); worker.activate();
  await pending; expect(boundary.reload).not.toHaveBeenCalled(); expect(useSimStore.getState()).toBe(state);
});
it('activation times out once and releases its state listener', async () => {
  vi.useFakeTimers();
  try {
    const { worker, boundary } = fixture(); const remove = vi.spyOn(worker, 'removeEventListener');
    const pending = applySavedFlightUpdate(worker, boundary); const failure = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(10000); await failure;
    expect(worker.postMessage).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1); expect(boundary.reload).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
it('a still-current save allows one activation and reload without mutating the session', async () => {
  const { worker, boundary } = fixture(); const state = useSimStore.getState(); worker.postMessage.mockImplementation(() => worker.activate());
  await applySavedFlightUpdate(worker, boundary);
  expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' });
  expect(boundary.reload).toHaveBeenCalledTimes(1); expect(useSimStore.getState()).toBe(state);
});
