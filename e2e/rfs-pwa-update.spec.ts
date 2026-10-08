import { readdir, writeFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

// Installed generated SW and two actual builds with explicitly synthetic cohorts.
async function diagnostic(page: Page) {
  await page.bringToFront();
  const trigger = page.getByRole('button', { name: 'Diagnostic export', exact: true });
  if (!(await trigger.isVisible())) {
    await page.getByRole('button', { name: /OVL:\s*FLIGHT/i }).click();
    await page.getByRole('button', { name: /OVL:\s*MINIMAL/i }).click();
  }
  await trigger.click();
  const result = JSON.parse((await page.getByLabel('Diagnostic JSON preview').textContent())!);
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  return result;
}

async function installV1(page: Page, request: APIRequestContext) {
  expect((await request.post('/__fixture/version/1')).status()).toBe(204);
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function stageV2(page: Page, request: APIRequestContext) {
  expect((await request.post('/__fixture/version/2')).status()).toBe(204);
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  const update = page.getByRole('status', { name: 'App update', exact: true });
  await expect(update).toBeVisible({ timeout: 30000 });
  return update;
}

async function saveAndActivate(page: Page) {
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Save session and update', exact: true }).click()]);
  await expect(page.getByLabel('Saved scenario slot', { exact: true })).toContainText('Before app update');
  const stored = await page.evaluate(() => localStorage.getItem('rfs.scenarioSnapshot.v1'));
  const slots = JSON.parse(stored!).slots;
  const id = Object.keys(slots).find((key) => key.startsWith('update-'));
  expect(id).toBeDefined();
  expect(slots[id!].snapshot.status).toBe('paused');
  expect(slots[id!].snapshot.simulationTimeSeconds).toBeGreaterThan(0);
  return { stored, slots, id: id! };
}

async function restoreUpdatedSave(page: Page, id: string) {
  await page.bringToFront();
  await page.getByRole('button', { name: /OVL:\s*DEBUG/i }).click();
  await page.getByRole('button', { name: /OVL:\s*FLIGHT/i }).waitFor();
  await page.getByLabel('Saved scenario slot', { exact: true }).selectOption(id);
  await page.getByRole('button', { name: 'Load saved scenario state', exact: true }).click();
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
}

async function runtimeObservation(page: Page) {
  return page.evaluate(() => {
    const getRuntime = (window as unknown as { __RFS_GET_SIMULATION_RUNTIME: () => { diagnosticState?: () => {
      executionBackend: string | null; observedWorkerCohort: string | null;
    } } }).__RFS_GET_SIMULATION_RUNTIME;
    return getRuntime().diagnosticState?.();
  });
}

async function receipt(testInfo: TestInfo, name: string, evidence: Record<string, unknown>) {
  const path = testInfo.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify({ syntheticBuildIdentities: true, ...evidence }, null, 2));
  await testInfo.attach(name, { path, contentType: 'application/json' });
}

// Each case completes an installed-worker transaction. The former single case
// spent its240s budget before quota discard in CI; every acceptance assertion is
// retained below, with original assertion deadlines/retries and finite case caps.
test('installed update stays deferred while the current flight runs', async ({ page, request }, testInfo) => {
  test.setTimeout(240000);
  await installV1(page, request);
  await page.getByRole('button', { name: 'LOAD PLAN', exact: true }).click();
  await page.getByLabel('Save slot name').fill('Preserved before update');
  await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await expect(page.getByText('Preserved before update saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'START ROLL', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PAUSE', exact: true })).toBeVisible();
  const v1 = await diagnostic(page);
  expect(v1.identities.appCohort).toBe('a'.repeat(40)); expect(v1.identities.observedWorkerCohort).toBe('a'.repeat(40));
  const update = await stageV2(page, request);
  await expect(page.getByRole('button', { name: 'Save session and update', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(update).toHaveCount(0); await expect(page.getByRole('button', { name: 'PAUSE', exact: true })).toBeVisible();
  const deferred = await diagnostic(page); expect(deferred.identities.appCohort).toBe(v1.identities.appCohort);
  expect(deferred.runtime.simulationSeconds).toBeGreaterThanOrEqual(v1.runtime.simulationSeconds);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click();
  await page.getByRole('button', { name: 'Update available', exact: true }).click();
  await expect(update).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save session and update', exact: true })).toBeEnabled();
  await receipt(testInfo, 'staged-pwa-deferral', { scope: 'Active-flight refusal and explicit deferral; no activation', v1, deferred });
});

test('installed update recovers from quota refusal and restores the saved offline cohort', async ({ page, context, request }, testInfo) => {
  test.setTimeout(240000);
  await installV1(page, request);
  await page.getByRole('button', { name: 'LOAD PLAN', exact: true }).click();
  await page.getByLabel('Save slot name').fill('Preserved before update');
  await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await expect(page.getByText('Preserved before update saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'START ROLL', exact: true }).click();
  await expect.poll(async () => (await runtimeObservation(page))?.observedWorkerCohort).toBe('a'.repeat(40));
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click();
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
  const update = await stageV2(page, request);
  await expect(page.getByRole('button', { name: 'Save session and update', exact: true })).toBeEnabled();
  const beforeQuota = await page.evaluate(() => {
    const old = localStorage.getItem('rfs.scenarioSnapshot.v1');
    try { for (let i = 0; i < 3000; i++) localStorage.setItem(`pwa-quota-${i}`, 'x'.repeat(4096)); }
    catch (error) { if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error; }
    return old;
  });
  try {
    await page.getByRole('button', { name: 'Save session and update', exact: true }).click();
    await expect(update).toContainText('Saving failed.');
    expect(await page.evaluate(() => localStorage.getItem('rfs.scenarioSnapshot.v1'))).toBe(beforeQuota);
    await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    await expect(page.getByRole('button', { name: 'Discard pending save', exact: true })).toBeVisible();
  } finally { await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('pwa-quota-')).forEach((key) => localStorage.removeItem(key))); }
  await page.getByRole('button', { name: 'Discard pending save', exact: true }).click();
  const { stored, slots, id } = await saveAndActivate(page);
  expect(slots['preserved-before-update']).toEqual(JSON.parse(beforeQuota!).slots['preserved-before-update']);
  const v2 = await diagnostic(page); expect(v2.identities.appCohort).toBe('b'.repeat(40));
  await restoreUpdatedSave(page, id);
  const client = await context.newCDPSession(page); await client.send('Network.clearBrowserCache');
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('button', { name: 'START ROLL', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('rfs.scenarioSnapshot.v1'))).toBe(stored);
  await page.getByRole('button', { name: 'START ROLL', exact: true }).click();
  await expect.poll(async () => (await runtimeObservation(page))?.observedWorkerCohort).toBe('b'.repeat(40));
  const offline = await diagnostic(page); expect(offline.runtime.lastValidatedBackend).toBe('browser-worker');
  expect(offline.identities.observedWorkerCohort).toBe('b'.repeat(40));
  await context.setOffline(false);
  await receipt(testInfo, 'staged-pwa-quota-offline', { scope: 'Real quota refusal, preserved slots, verified save/activation, paused restore and cache-cleared offline v2 execution', v2, offline });
});

test('explicit installed update preserves another running v1 flight and paused restoration', async ({ page, context, request }, testInfo) => {
  test.setTimeout(240000);
  await installV1(page, request);
  await page.getByRole('button', { name: 'LOAD PLAN', exact: true }).click();
  await page.getByRole('button', { name: 'START ROLL', exact: true }).click();
  await expect.poll(async () => (await runtimeObservation(page))?.observedWorkerCohort).toBe('a'.repeat(40));
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click();
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
  const other = await context.newPage(); await other.goto('/');
  await other.getByRole('button', { name: 'START ROLL', exact: true }).click();
  await expect(other.getByRole('button', { name: 'PAUSE', exact: true })).toBeVisible();
  await expect.poll(async () => (await runtimeObservation(other))?.observedWorkerCohort).toBe('a'.repeat(40));
  let otherNavigations = 0; other.on('framenavigated', (frame) => { if (frame === other.mainFrame()) otherNavigations++; });
  await page.bringToFront();
  await stageV2(page, request);
  const { id } = await saveAndActivate(page);
  const v2 = await diagnostic(page); expect(v2.identities.appCohort).toBe('b'.repeat(40));
  expect(otherNavigations).toBe(0); await expect(other.getByRole('button', { name: 'PAUSE', exact: true })).toBeVisible();
  const continuing = await diagnostic(other);
  expect(continuing.identities.appCohort).toBe('a'.repeat(40));
  expect(continuing.identities.observedWorkerCohort).toBe('a'.repeat(40));
  expect(continuing.runtime.simulationSeconds).toBeGreaterThan(0);
  await restoreUpdatedSave(page, id);
  await receipt(testInfo, 'staged-pwa-other-flight', { scope: 'Actual v1→v2 activation with no navigation of the other running v1 tab and explicit paused save restoration; no continuous/full-flight claim', v2, continuing, otherNavigations });
});

test('installed v2 rejects an actual v1 worker reply and continues with validated fallback', async ({ page: mismatched, request }, testInfo) => {
  expect((await request.post('/__fixture/version/2')).status()).toBe(204);
  const oldAsset = (await readdir('dist/pwa-v1/assets')).find((name) => /^simulationWorker-.*\.js$/.test(name));
  expect(oldAsset).toBeDefined(); const v1WorkerUrl = `http://127.0.0.1:5174/assets/${oldAsset}`;

  await mismatched.addInitScript((oldUrl) => {
    const NativeWorker = window.Worker;
    const replies: Array<{ buildCohort: string; type: string; kind?: string }> = [];
    Object.assign(window, { mismatchedWorkerReplies: replies });
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        const physics = String(url).includes('simulationWorker'); super(physics ? oldUrl : url, options);
        if (physics) this.addEventListener('message', (event) => replies.push({ buildCohort: event.data.buildCohort, type: event.data.type, kind: event.data.error?.kind }));
      }
    };
  }, v1WorkerUrl);
  await mismatched.goto('/'); await mismatched.evaluate(async () => { await navigator.serviceWorker.ready; });
  await mismatched.reload(); await mismatched.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await mismatched.getByRole('button', { name: 'START ROLL', exact: true }).click();
  // Read the actual runtime without repeatedly opening a modal; the visible
  // export independently corroborates the validated execution backend.
  await expect.poll(() => mismatched.evaluate(() => {
    const getRuntime = (window as unknown as { __RFS_GET_SIMULATION_RUNTIME: () => { diagnosticState?: () => { executionBackend: string | null } } }).__RFS_GET_SIMULATION_RUNTIME;
    return getRuntime().diagnosticState?.().executionBackend;
  })).toBe('main-thread');
  const fallback = await diagnostic(mismatched); expect(fallback.identities.appCohort).toBe('b'.repeat(40));
  expect(fallback.identities.observedWorkerCohort).toBe('unavailable'); expect(fallback.runtime.simulationSeconds).toBeGreaterThan(0);
  const mismatchReplies = await mismatched.evaluate(() => (window as unknown as { mismatchedWorkerReplies: Array<{ buildCohort: string; type: string; kind?: string }> }).mismatchedWorkerReplies);
  expect(mismatchReplies[0]).toEqual({ buildCohort: 'a'.repeat(40), type: 'simulation.step.error', kind: 'protocol' });
  const receipt = testInfo.outputPath('mismatched-worker-cohort.json');
  await writeFile(receipt, JSON.stringify({ syntheticBuildIdentities: true, fallback, mismatchReplies }, null, 2));
  await testInfo.attach('mismatched-worker-cohort', { path: receipt, contentType: 'application/json' });
});
