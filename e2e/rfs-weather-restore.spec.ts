import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';

// Real browser fetch/React/store restore, with a controlled local METAR endpoint.
// No claim about a live weather provider or continuous flight.
test('saved atmosphere survives a late browser METAR and reset starts a new weather session', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const POST_RESET_THROTTLE_MS = 1_500;
  const RESET_QNH_OBSERVATION_TIMEOUT_MS = 15_000;
  const held: Array<() => void> = [];
  let released = false;
  let requests = 0;
  let completed = 0;
  let postResetReplyDelays = 0;
  page.on('response', (response) => {
    if (response.url().includes('/__e2e_metar')) void response.finished().then(() => { completed++; });
  });
  await page.route('**/__e2e_metar?**', async (route) => {
    requests++;
    const initial = !released;
    if (initial) await new Promise<void>((resolve) => { held.push(resolve); });
    if (!initial) {
      postResetReplyDelays++;
      await new Promise<void>((resolve) => { setTimeout(resolve, POST_RESET_THROTTLE_MS); });
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([{
      wdir: 280, wspd: 20, wgst: 28, tmp: 25, altim: initial ? 1030 : 1004,
      visib: 9000, clouds: [],
    }]) });
  });
  await openRfs(page);
  // React StrictMode may mount the effect twice. Hold every startup request,
  // including the active one, instead of assuming a request cardinality.
  await expect.poll(() => held.length).toBeGreaterThan(0);
  const initialRequests = requests;
  const saved = await page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path);
    const s = useSimStore.getState();
    s.setWeather({ ...s.weather!, qnhHpa: 987, surfaceTemperatureC: -8,
      visibilityM: 2300, clouds: [{ cover: 'OVC', base: 900 }], cloudSeed: 12345 });
    s.setWind({ dir: 130, speed: 7, gustSpeed: 11, gustSeed: 54321 });
    s.start(); s.pause();
    if (!await s.saveScenarioState(undefined, { slotId: 'weather-native', slotName: 'Saved atmosphere' })) throw new Error('Native weather save failed');
    s.loadScenarioState(undefined, 'weather-native');
    const restored = useSimStore.getState();
    return { weather: restored.weather, wind: restored.wind, aircraft: restored.aircraft,
      generation: restored.asyncPhysicsGeneration, epoch: restored.weatherEpoch };
  });
  released = true;
  held.forEach((finish) => finish());
  await expect.poll(() => completed).toBe(initialRequests);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const restored = await page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path);
    const s = useSimStore.getState();
    return { weather: s.weather, wind: s.wind, aircraft: s.aircraft, generation: s.asyncPhysicsGeneration,
      epoch: s.weatherEpoch, status: s.status, restored: s.weatherRestored };
  });
  expect(restored).toEqual({ ...saved, status: 'paused', restored: true });
  await expect(page.getByLabel('Primary flight display', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'RESET', exact: true }).click();
  const resetRequestedAtMs = Date.now();
  await expect.poll(() => requests).toBeGreaterThan(initialRequests);
  const firstPostResetRequestAtMs = Date.now();
  await expect.poll(async () => page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path);
    return useSimStore.getState().weather?.qnhHpa;
  }), { timeout: RESET_QNH_OBSERVATION_TIMEOUT_MS }).toBe(1004);
  const qnhObservedAtMs = Date.now();
  const receipt = testInfo.outputPath('native-weather-restore.json');
  await writeFile(receipt, JSON.stringify({ scope: 'Controlled local HTTP METAR; actual browser restore/reset, no live-provider/full-flight claim',
    restored, initialRequests, requests, completed, postResetReplyDelays,
    resetToQnhObservationMs: qnhObservedAtMs - resetRequestedAtMs,
    requestToQnhObservationMs: qnhObservedAtMs - firstPostResetRequestAtMs,
    userAgent: await page.evaluate(() => navigator.userAgent) }, null, 2));
  await testInfo.attach('native-weather-restore', { path: receipt, contentType: 'application/json' });
});
