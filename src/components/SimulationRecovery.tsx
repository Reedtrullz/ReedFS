import { useState } from 'react';
import { useSimStore } from '../store/simStore';
import { serializeSimulationFailure } from '../sim/failureEvidence';

export function SimulationRecovery() {
  const failure = useSimStore((state) => state.simulationFailure);
  const checkpoint = useSimStore((state) => state.lastValidCheckpoint);
  const restore = useSimStore((state) => state.restoreLastValidCheckpoint);
  const reset = useSimStore((state) => state.reset);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  if (!failure || failure.recovered) return null;
  const exportEvidence = () => {
    try {
      const url = URL.createObjectURL(new Blob([serializeSimulationFailure(failure)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'rfs-simulation-failure.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportMessage('Evidence exported locally. Review before sharing.');
    } catch { setExportMessage('Export unavailable. Evidence remains in this session.'); }
  };
  return <div role="alert" aria-label="Simulation recovery" style={{ background: '#251b12', color: '#ffe1ae', padding: 8, border: '1px solid #ffe1ae' }}>
    <strong>Simulation paused: invalid result.</strong> Instruments show the last valid state.
    <div>{failure.message}</div>
    <button onClick={restore} disabled={!checkpoint}>Restore last valid checkpoint</button>{' '}
    <button onClick={exportEvidence}>Export failure evidence</button>{' '}
    <button onClick={reset}>Reset scenario</button>
    <div>Export includes flight position and route. It stays on your device.</div>
    {exportMessage && <div role="status">{exportMessage}</div>}
  </div>;
}
