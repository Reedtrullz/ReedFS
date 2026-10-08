import { expect, test } from '@playwright/test';

// Rendered instrument integration with actual workers, distinct from full flight.
test('delayed native observation preserves coherent readouts, labels age, and commits together', async ({ page }) => {
  await page.goto('/e2e/fixtures/runtime.html');
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/instrument-observation.tsx';
    const fixture = await import(/* @vite-ignore */ path); const control = await fixture.mountObservedPfd(); control.defer();
  });
  const pfd = page.getByLabel('Primary flight display', { exact: true });
  const state = page.getByLabel('PFD observation state', { exact: true });
  await expect(state).toContainText('CURRENT');
  await expect(pfd).toContainText('CMD_A');
  const oldStep = await pfd.getAttribute('data-observation-step');
  const oldAltitude = await page.getByLabel('Observed altitude', { exact: true }).textContent();
  const oldSpeed = await page.getByLabel('Observed airspeed', { exact: true }).textContent();
  await page.evaluate(async () => { const path = '/e2e/fixtures/instrument-observation.tsx'; (await import(/* @vite-ignore */ path)).beginNewObservation(); });
  await expect(state).toContainText('WAITING');
  await expect(page.getByLabel('PFD MCP selected targets', { exact: true })).toContainText('23000');
  await expect(page.getByLabel('Observed altitude', { exact: true })).toHaveText(oldAltitude!);
  await expect(page.getByLabel('Observed airspeed', { exact: true })).toHaveText(oldSpeed!);
  await expect(pfd).toContainText('CMD_A');
  await expect(state).toContainText('STALE');
  await expect(pfd).toHaveAttribute('data-observation-step', oldStep!);
  await expect.poll(() => page.evaluate(async () => { const path = '/e2e/fixtures/instrument-observation.tsx'; return (await import(/* @vite-ignore */ path)).responseCount(); })).toBe(1);
  await page.evaluate(async () => { const path = '/e2e/fixtures/instrument-observation.tsx'; (await import(/* @vite-ignore */ path)).releaseObservation(); });
  await expect(pfd).not.toHaveAttribute('data-observation-step', oldStep!);
  await expect(state).toContainText('CURRENT');
  await expect(pfd).not.toContainText('CMD_A');
  await expect(page.getByLabel('Observed altitude', { exact: true })).not.toHaveText(oldAltitude!);
  const bounds = await state.boundingBox(); expect(bounds?.width).toBeGreaterThan(200); expect(bounds?.height).toBeGreaterThan(12);
  await page.evaluate(async () => { const path = '/e2e/fixtures/instrument-observation.tsx'; (await import(/* @vite-ignore */ path)).pauseObservation(); });
  await expect(state).toContainText('PAUSED');
  await page.evaluate(async () => { const path = '/e2e/fixtures/instrument-observation.tsx'; (await import(/* @vite-ignore */ path)).disposeObservedPfd(); });
});
