import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Diagnostic integration uses explicit store seeding, separate from flight proof.
async function readSession(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path);
    const state = useSimStore.getState();
    return { status: state.status, time: state.simulationTimeSeconds, aircraft: state.aircraft,
      input: state.input, generation: state.asyncPhysicsGeneration, scenario: state.selectedScenarioId };
  });
}

test('error recovery survives unavailable later chunks and exports the UI-failure flag', async ({ page }) => {
  await page.goto('/e2e/fixtures/runtime.html');
  await page.evaluate(async () => { const path = '/e2e/fixtures/diagnostic-error.tsx'; (await import(/* @vite-ignore */ path)).mountErrorProbe(); });
  await expect(page.getByRole('button', { name: 'Inject UI failure', exact: true })).toBeVisible();
  await page.route('**/src/components/DiagnosticExport.tsx*', (route) => route.abort());
  await page.getByRole('button', { name: 'Inject UI failure', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Diagnostic export', exact: true }).click();
  const payload = (await page.getByLabel('Diagnostic JSON preview').textContent())!;
  expect(JSON.parse(payload).fault.uiFailure).toBe(true); expect(payload).not.toMatch(/PLANTED_/);
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try Again', exact: true })).toBeVisible();
});

test('native preview downloads exact private-default data and keeps the paused flight unchanged', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /OVL:\s*FLIGHT/i }).click();
  await page.getByRole('button', { name: /OVL:\s*MINIMAL/i }).click();
  await expect(page.getByRole('button', { name: 'Diagnostic export', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path);
    useSimStore.getState().start(); useSimStore.getState().pause();
    const cycle: Record<string, unknown> = { name: 'PLANTED_PERSON_NAME', token: 'PLANTED_PRIVATE_TOKEN' }; cycle.self = cycle;
    useSimStore.setState({ simulationFailure: { message: 'PLANTED_PERSON_NAME PLANTED_PRIVATE_TOKEN', detectedAtIso: '2026-10-08T00:00:00Z', input: cycle, result: cycle, recovered: false, checkpoint: null } });
  });
  const before = await readSession(page);
  const trigger = page.getByRole('button', { name: 'Diagnostic export', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Diagnostic export preview', exact: true });
  await expect(dialog).toBeVisible();
  const preview = await page.getByLabel('Diagnostic JSON preview', { exact: true }).textContent();
  expect(preview).not.toMatch(/PLANTED_|latitude|longitude|stack/);
  expect(JSON.parse(preview!).runtime.status).toBe('paused');
  expect(JSON.parse(preview!).fault.present).toBe(true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download diagnostic JSON', exact: true }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toBe('rfs-diagnostic.json');
  const contents = await readFile((await download.path())!, 'utf8');
  expect(contents).toBe(preview); expect(Buffer.byteLength(contents)).toBeLessThanOrEqual(8192);
  await page.getByRole('checkbox', { name: 'Include flight position', exact: true }).check();
  expect(JSON.parse((await page.getByLabel('Diagnostic JSON preview').textContent())!).position.latitude).toBe(before.aircraft.position.lat);
  await dialog.press('ArrowUp'); await dialog.press('Escape');
  await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  expect(await readSession(page)).toEqual(before);
  await trigger.click();
  await expect(page.getByRole('checkbox', { name: 'Include flight position', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  expect(await readSession(page)).toEqual(before);
});
