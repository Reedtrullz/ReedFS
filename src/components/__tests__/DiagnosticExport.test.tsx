import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DiagnosticExport } from '../DiagnosticExport';
import { useSimStore } from '../../store/simStore';

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
const originalCreateUrl = URL.createObjectURL;
const originalRevokeUrl = URL.revokeObjectURL;
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); useSimStore.getState().reset();
  URL.createObjectURL = originalCreateUrl; URL.revokeObjectURL = originalRevokeUrl;
  for (const [name, descriptor] of [['showModal', originalShow], ['close', originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

it('previews exactly the downloaded fields without resuming or mutating a paused session', async () => {
  useSimStore.getState().reset(); useSimStore.getState().start(); useSimStore.getState().pause();
  const state = useSimStore.getState();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open'); } });
  let downloaded: Blob | null = null;
  URL.createObjectURL = vi.fn((blob: Blob) => { downloaded = blob; return 'blob:diagnostic-test'; });
  URL.revokeObjectURL = vi.fn(); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<DiagnosticExport />);
  fireEvent.click(screen.getByRole('button', { name: 'Diagnostic export' }));
  expect(screen.getByRole('dialog', { name: 'Diagnostic export preview' })).toBeVisible();
  const preview = screen.getByLabelText('Diagnostic JSON preview').textContent;
  expect(JSON.parse(preview!).position).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: 'Download diagnostic JSON' }));
  expect(downloaded).not.toBeNull();
  const contents = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(downloaded!); });
  expect(contents).toBe(preview);
  expect(useSimStore.getState()).toBe(state); expect(state.status).toBe('paused');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Include flight position' }));
  expect(JSON.parse(screen.getByLabelText('Diagnostic JSON preview').textContent!).position.latitude).toBe(state.aircraft.position.lat);
});
