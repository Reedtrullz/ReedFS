import { useSyncExternalStore } from 'react';
import { useSimStore } from '../store/simStore';
import { deferFlightUpdate, flightUpdates, requestFlightUpdate, showFlightUpdate } from '../app/flightUpdates';

export function FlightUpdateBanner() {
  const update = useSyncExternalStore(flightUpdates.subscribe, flightUpdates.snapshot);
  const status = useSimStore((state) => state.status);
  const saving = useSimStore((state) => Boolean(state.pendingScenarioSave || state.asyncPhysicsInFlight));
  if (!update.available) {
    if (!update.message || update.dismissed) return null;
    return <div role="status" aria-label="App updates unavailable">
      <p>{update.message}</p>
      <button onClick={deferFlightUpdate}>Dismiss update status</button>
    </div>;
  }
  if (update.dismissed) return <button onClick={showFlightUpdate}>Update available</button>;
  return <div role="status" aria-label="App update">
    <p>{update.message || (status === 'running' ? 'Update available. Pause and save before updating.' : 'Update available. Save this session before updating.')}</p>
    <button onClick={() => { void requestFlightUpdate(); }} disabled={status === 'running' || saving || update.busy}>Save session and update</button>{' '}
    <button onClick={deferFlightUpdate}>Later</button>
  </div>;
}
