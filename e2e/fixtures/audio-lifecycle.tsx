import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useAudioLoop } from '../../src/hooks/useAudioLoop';

function AudioProbe() { useAudioLoop(true); return null; }

/** Integration fixture: mount enabled audio after the test's explicit gesture. */
export async function mountStrictAudioProbe(): Promise<() => void> {
  const element = document.createElement('div'); document.body.append(element);
  const root = createRoot(element);
  root.render(<StrictMode><AudioProbe /></StrictMode>);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return () => { root.unmount(); element.remove(); };
}
