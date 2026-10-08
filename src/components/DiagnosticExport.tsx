import { useRef, useState } from 'react';
import { useSimStore } from '../store/simStore';
import { captureDiagnosticSnapshot, serializeDiagnosticBundle } from '../sim/diagnosticBundle';

export function DiagnosticExport({ uiFailure = false }: { uiFailure?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState<ReturnType<typeof captureDiagnosticSnapshot> | null>(null);
  const [includePosition, setIncludePosition] = useState(false);
  const [message, setMessage] = useState('');
  const payload = snapshot ? serializeDiagnosticBundle(snapshot, includePosition) : '';
  const open = () => {
    try {
      setSnapshot(captureDiagnosticSnapshot(useSimStore.getState(), { nowMs: performance.now(), uiFailure }));
      setIncludePosition(false); setMessage(''); dialog.current?.showModal();
    } catch { setMessage('Diagnostic capture is unavailable.'); }
  };
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'rfs-diagnostic.json';
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Diagnostic JSON downloaded.');
    } catch { setMessage('Download unavailable. The preview remains available.'); }
  };
  return <>
    <button type="button" onClick={open}>Diagnostic export</button>
    <dialog ref={dialog} aria-label="Diagnostic export preview" onKeyDown={(event) => event.stopPropagation()}
      onClose={() => setSnapshot(null)} style={{ maxWidth: 'min(700px, calc(100vw - 32px))', maxHeight: '80vh', color: '#eee', background: '#161c22', border: '1px solid #9ddcff', padding: 16 }}>
      <h2>Diagnostic export</h2>
      <p>Preview the exact JSON before downloading. Flight position is optional.</p>
      <label><input type="checkbox" checked={includePosition} onChange={(event) => setIncludePosition(event.target.checked)} /> Include flight position</label>
      <pre aria-label="Diagnostic JSON preview" style={{ overflow: 'auto', maxHeight: '50vh', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{payload}</pre>
      <button type="button" onClick={download} disabled={!snapshot}>Download diagnostic JSON</button>{' '}
      <button type="button" onClick={() => dialog.current?.close()}>Close preview</button>
      {message && <p role="status">{message}</p>}
    </dialog>
    {message && !snapshot && <p role="status">{message}</p>}
  </>;
}
