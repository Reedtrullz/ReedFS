import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('actual worker overflow pauses before publication and supports explicit checkpoint recovery', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    let injected = false;
    Worker.prototype.postMessage = function(message, options) {
      if (!injected && message?.type === 'simulation.step.request') {
        injected = true;
        message.input.aircraft.velocity.u = 1e300;
      }
      return original.call(this, message, options);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'START ROLL', exact: true }).click();
  const recovery = page.getByRole('alert', { name: 'Simulation recovery' });
  await expect(recovery).toBeVisible();
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect(recovery).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export failure evidence' }).click();
  const path = await (await download).path();
  if (!path) throw new Error('local diagnostic download unavailable');
  const evidence = JSON.parse(await readFile(path, 'utf8'));
  expect(evidence.evidence.recovered).toBe(false);
  expect(JSON.stringify(evidence.evidence.result)).toMatch(/\[NaN\]|\[Infinity\]/);
  expect(evidence.evidence.checkpoint.aircraft.velocity.u).toBeLessThan(1000);
  await page.getByRole('button', { name: 'Restore last valid checkpoint' }).click();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PAUSE', exact: true })).toBeVisible();
  await expect(recovery).toHaveCount(0);
  await page.getByText('Previous failure evidence', { exact: true }).click();
  const retainedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export failure evidence' }).click();
  await retainedDownload;
  await expect(page.getByRole('button', { name: 'PAUSE', exact: true })).toBeVisible();
});
