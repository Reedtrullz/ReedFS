import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

function FailureProbe() {
  const [failed, setFailed] = useState(false);
  if (failed) throw new Error('PLANTED_PRIVATE_TOKEN PLANTED_PERSON_NAME');
  return <button onClick={() => setFailed(true)}>Inject UI failure</button>;
}

export function mountErrorProbe() {
  const node = document.createElement('div'); document.body.append(node);
  createRoot(node).render(<ErrorBoundary><FailureProbe /></ErrorBoundary>);
}
