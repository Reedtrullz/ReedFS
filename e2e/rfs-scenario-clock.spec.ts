import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openRfs, cycleCameraTo } from './helpers/rfsPage';

// Read-only references to actual native objects; no clock/worker/render replacement.
async function expose(page: Page, sourcePath: string, anchor: string, reference: string, value: string) {
  await page.route(`**/${sourcePath}`, async (route) => {
    const response = await route.fetch(); const source = await response.text();
    expect(source.split(anchor)).toHaveLength(2);
    await route.fulfill({ response, body: source.replace(anchor, `${anchor}\nReflect.set(window, '${reference}', ${value});`) });
  });
}

async function observe(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const clockPath = '/src/sim/scenarioClock.ts'; const sunPath = '/src/sim/sun.ts';
    const runtimePath = '/src/sim/simulationRuntime.ts';
    const { useSimStore } = await import(/* @vite-ignore */ path);
    const { scenarioUtcMs } = await import(/* @vite-ignore */ clockPath);
    const { computeSunPosition } = await import(/* @vite-ignore */ sunPath);
    const { getSimulationRuntime } = await import(/* @vite-ignore */ runtimePath);
    const state = useSimStore.getState(); const utcMs = scenarioUtcMs(state.aircraft);
    const viewer = Reflect.get(window, '__clockViewer');
    const julian = viewer.clock.currentTime;
    const JulianDate = Reflect.get(julian, 'constructor');
    const toDate = JulianDate.toDate;
    const projected = JulianDate.fromDate(new Date(utcMs));
    const three = Reflect.get(window, '__clockThree'); const cockpit = Reflect.get(window, '__clockCockpit');
    const light = (bridge: typeof three) => bridge?.threeScene.children.filter((child: { type: string }) => ['AmbientLight', 'DirectionalLight'].includes(child.type))
      .map((child: { type: string; intensity: number }) => ({ type: child.type, intensity: child.intensity }));
    const camera = viewer.camera.positionCartographic;
    const lat = camera.latitude * 180 / Math.PI; const lon = camera.longitude * 180 / Math.PI;
    const runtime = getSimulationRuntime().diagnosticState?.();
    return { status: state.status, simTime: state.aircraft.simTime, utcMs, timeOfDay: state.aircraft.timeOfDay,
      clockUtcMs: toDate(julian).getTime(), frameUtcMs: toDate(viewer.scene.frameState.time).getTime(),
      clockProjectionSeconds: JulianDate.secondsDifference(julian, projected),
      frameProjectionSeconds: JulianDate.secondsDifference(viewer.scene.frameState.time, projected),
      shouldAnimate: viewer.clock.shouldAnimate, globeLighting: viewer.scene.globe.enableLighting,
      skyBrightnessShift: viewer.scene.skyAtmosphere?.brightnessShift,
      baseColor: [viewer.scene.globe.baseColor.red, viewer.scene.globe.baseColor.green, viewer.scene.globe.baseColor.blue],
      lat, lon, elevation: computeSunPosition(lat, lon, utcMs).elevation * 180 / Math.PI,
      threeLights: light(three), cockpitLights: light(cockpit), runtime };
  });
}

async function applyUtc(page: Page, utc: string) {
  const field = page.getByLabel('UTC date and time', { exact: true });
  if (!(await field.isVisible())) await page.getByText('Date and time (UTC)', { exact: true }).click();
  await field.fill(utc.replace(/(?:\.000)?Z$/, '').replace(/:00$/, ''));
  await page.getByRole('button', { name: 'Apply UTC date/time', exact: true }).click();
  await expect(page.getByLabel('Scenario UTC', { exact: true })).toContainText(utc.slice(0, 19));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test.beforeEach(async ({ page }) => {
  await expose(page, 'src/viewport/CesiumViewport.tsx', 'viewerRef.current = viewer;', '__clockViewer', 'viewer');
  await expose(page, 'src/viewport/ThreeLayer.tsx', 'ttcRef.current = ttc;', '__clockThree', 'ttc');
  await expose(page, 'src/viewport/CockpitLayer.tsx', 'ttc.threeScene.add(panelLight);', '__clockCockpit', 'ttc');
});

test('native worker, paused renderer and exact restored save use the same committed UTC', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await openRfs(page);
  await expect(page.locator('[data-rfs-surface="three"]')).toHaveCount(1, { timeout: 30000 });
  await applyUtc(page, '2026-12-31T23:59:59Z');
  await page.getByRole('button', { name: 'LOAD PLAN', exact: true }).click();
  expect((await observe(page)).utcMs).toBe(Date.UTC(2026, 11, 31, 23, 59, 59));
  await page.getByRole('button', { name: 'START ROLL', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply UTC date/time', exact: true })).toBeDisabled();
  await expect.poll(async () => (await observe(page)).runtime?.executionBackend).toBe('browser-worker');
  await expect.poll(async () => (await observe(page)).simTime).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click();
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
  const paused = await observe(page);
  expect(paused.utcMs).toBe(Date.UTC(2026, 11, 31, 23, 59, 59) + paused.simTime);
  expect(paused.shouldAnimate).toBe(false);
  expect(paused.clockProjectionSeconds).toBe(0);
  expect(paused.frameProjectionSeconds).toBe(0);
  // Date truncates fractional milliseconds; JulianDate.toDate can truncate a
  // further millisecond after floating-point conversion. Compare exact Julian
  // projection above, and bound the lossy display roundtrip separately.
  expect(Math.abs(paused.clockUtcMs - paused.utcMs)).toBeLessThan(2);
  expect(Math.abs(paused.frameUtcMs - paused.utcMs)).toBeLessThan(2);
  const wall = await page.evaluate(() => performance.now()); await page.waitForTimeout(1000);
  expect(await page.evaluate(() => performance.now()) - wall).toBeGreaterThanOrEqual(900);
  const frozen = await observe(page); expect(frozen.utcMs).toBe(paused.utcMs); expect(frozen.clockUtcMs).toBe(paused.clockUtcMs);
  await page.getByLabel('Save slot name').fill('Clock practice');
  await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await expect(page.getByText('Clock practice saved.', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rfs.scenarioSnapshot.v1')!).slots['clock-practice'].snapshot);
  expect(saved.version).toBe(4); expect(saved.identities.clock).toBe('utc-epoch-ms/committed-sim-time-ms/v2');
  expect(saved.identities.atmosphere).toBe('ussa-1976-lower-atmosphere/1.0.0');
  expect(saved.aircraft.utcEpochMs + saved.aircraft.simTime).toBe(paused.utcMs);
  await applyUtc(page, '2026-09-24T12:00:00Z');
  await page.getByLabel('Saved scenario slot', { exact: true }).selectOption('clock-practice');
  await page.getByRole('button', { name: 'Load saved scenario state', exact: true }).click();
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
  const restored = await observe(page); expect(restored.utcMs).toBe(paused.utcMs); expect(restored.simTime).toBe(paused.simTime);
  expect(await page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path); return useSimStore.getState().weather;
  })).toEqual(saved.weather);
  const receipt = testInfo.outputPath('native-scenario-clock.json');
  await writeFile(receipt, JSON.stringify({ scope: 'Actual worker commit, paused wall interval and v4 save/restore UTC; exact Cesium Julian projection and Date roundtrip within2ms; no full-flight or device claim', paused, frozen, restored }, null, 2));
  await testInfo.attach('native-scenario-clock', { path: receipt, contentType: 'application/json' });
});

test('fixed day, night and the black-globe boundary retain readable native cues', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await openRfs(page);
  await expect(page.locator('[data-rfs-surface="three"]')).toHaveCount(1, { timeout: 30000 });
  await applyUtc(page, '2026-09-24T12:00:00Z');
  const day = await observe(page); expect(day.elevation).toBeGreaterThan(10); expect(day.globeLighting).toBe(true);
  expect(day.threeLights.find((x: { type: string }) => x.type === 'DirectionalLight')?.intensity).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('clock-native-day.png') });
  await applyUtc(page, '2026-09-24T02:04:00Z');
  const night = await observe(page); expect(night.elevation).toBeLessThan(-5); expect(night.globeLighting).toBe(false);
  expect(night.threeLights.find((x: { type: string }) => x.type === 'DirectionalLight')?.intensity).toBe(0);
  expect(night.baseColor.some((x: number) => x > 0)).toBe(true);
  expect(night.skyBrightnessShift).toBeCloseTo(-0.78, 8); expect(day.skyBrightnessShift).toBe(0);
  expect(Math.max(...night.baseColor)).toBeLessThan(Math.max(...day.baseColor));
  await expect(page.getByLabel('Primary flight display', { exact: true })).toBeVisible();
  const runwayLights = await page.evaluate(() => Reflect.get(window, '__clockViewer').entities.values
    .filter((x: { id: string }) => x.id.startsWith('runway-edge-light-')).length);
  expect(runwayLights).toBeGreaterThanOrEqual(18);
  await page.screenshot({ path: testInfo.outputPath('clock-native-night.png') });
  await cycleCameraTo(page, 'COCKPIT');
  await expect(page.locator('[data-rfs-surface="cockpit"]')).toHaveCount(1, { timeout: 30000 });
  const cockpit = await observe(page);
  expect(cockpit.cockpitLights.find((x: { type: string }) => x.type === 'AmbientLight')?.intensity).toBeGreaterThanOrEqual(0.25);
  await expect(page.getByLabel('Primary flight display', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('clock-native-night-cockpit.png') });
  const boundaries = [];
  for (const elevation of [-2.01, -1.99]) {
    const utc = await page.evaluate(async ({ lat, lon, elevation }) => {
      const path = '/src/sim/sun.ts'; const { computeSunPosition } = await import(/* @vite-ignore */ path);
      let low = Date.UTC(2026, 8, 24); let high = low + 8 * 3600000;
      for (let i = 0; i < 40; i++) { const mid = (low + high) / 2;
        if (computeSunPosition(lat, lon, mid).elevation * 180 / Math.PI < elevation) low = mid; else high = mid; }
      return new Date(Math.round((low + high) / 2000) * 1000).toISOString();
    }, { lat: cockpit.lat, lon: cockpit.lon, elevation });
    await applyUtc(page, utc); const observed = await observe(page);
    expect(Math.abs(observed.elevation - elevation)).toBeLessThan(0.005);
    expect(observed.globeLighting).toBe(elevation > -2);
    expect(observed.baseColor.some((x: number) => x > 0)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`clock-native-boundary-${elevation}.png`) });
    boundaries.push(observed);
  }
  const receipt = testInfo.outputPath('native-scenario-lighting.json');
  await writeFile(receipt, JSON.stringify({ scope: 'Seeded native globe/Three/cockpit day/night and -2degree boundary; procedural runway entities and visible PFD, no photometric/AIP/device/full-flight claim', day, night, cockpit, runwayLights, boundaries }, null, 2));
  await testInfo.attach('native-scenario-lighting', { path: receipt, contentType: 'application/json' });
});
