import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('actual worker weather commits render ideal CAS and show unsupported air data explicitly', async ({ page }, testInfo) => {
  await page.goto('/e2e/fixtures/runtime.html');
  await page.evaluate(async () => { const path = '/e2e/fixtures/instrument-observation.tsx'; await (await import(/* @vite-ignore */ path)).mountObservedPfd(true); });
  const receipts = [];
  for (const [temperature, speed] of [[15, 250], [35, 250], [15, 400]]) {
    const row = await page.evaluate(async ([t, v]) => { const path = '/e2e/fixtures/instrument-observation.tsx'; return (await import(/* @vite-ignore */ path)).commitAirDataCase(t, v); }, [temperature, speed]);
    expect(row.backend).toBe('browser-worker'); expect(row.weather.surfaceTemperatureC).toBe(temperature);
    await expect(page.getByLabel('Airspeed tape', { exact: true })).toHaveAttribute('data-valid', String(row.air.airDataValid));
    await expect(page.getByLabel('Observed airspeed', { exact: true })).toHaveText(row.air.airDataValid ? String(Math.round(row.air.cas)) : '---');
    if (row.expectedAir.airDataValid) {
      expect(row.controller.thrustPid.prevError).toBeCloseTo(250 - row.expectedAir.cas, 8);
      expect(row.commands.throttle1).toBeGreaterThanOrEqual(0);
    } else {
      expect(row.controller.thrustPid).toEqual(row.beforeController.thrustPid);
      expect(row.controller.throttleLimited).toBe(row.beforeController.throttleLimited);
      expect(row.commands.throttle1).toBeUndefined(); expect(row.commands.throttle2).toBeUndefined();
    }
    receipts.push(row);
  }
  expect(receipts[0].air.cas).toBeGreaterThan(receipts[0].air.eas + 10);
  expect(receipts[0].air.ias).toBe(receipts[0].air.cas);
  expect(receipts[1].air.mach).toBeLessThan(receipts[0].air.mach);
  expect(receipts[1].air.cas).toBeLessThan(receipts[0].air.cas);
  expect(receipts[2].air.cas).toBeNull();
  await expect(page.getByLabel('Airspeed tape', { exact: true })).toContainText('IAS INVALID');
  await expect(page.getByLabel('Flight telemetry', { exact: true })).toContainText('IAS: INVALID');
  await expect(page.getByLabel('Flight telemetry', { exact: true })).not.toContainText('IAS: 0 kt');
  const path = testInfo.outputPath('native-compressible-airdata-qualification.json');
  await writeFile(path, JSON.stringify({ receipts }, null, 2) + '\n'); await testInfo.attach('native-compressible-airdata-qualification', { path, contentType: 'application/json' });
  await page.evaluate(async () => { const path = '/e2e/fixtures/instrument-observation.tsx'; (await import(/* @vite-ignore */ path)).disposeObservedPfd(); });
});
