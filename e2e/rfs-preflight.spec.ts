import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';

test('Briefing preflight readback follows scenario, flap and runway changes', async ({ page }) => {
  await openRfs(page);
  await expect(page.getByLabel('Preflight sheet')).toHaveCount(0);
  await page.getByRole('button', { name: 'Briefing', exact: true }).click();
  const sheet = page.getByRole('region', { name: 'Preflight sheet' });
  await expect(sheet).toContainText('ENVA 09');
  await expect(sheet).toContainText('61913');
  await page.getByRole('button', { name: 'Flaps Next', exact: true }).click();
  await expect(sheet).toContainText('10 commanded');
  await expect(sheet).toContainText('No matching gameplay fixture');
  await page.getByLabel('Scenario', { exact: true }).selectOption('ksea-light-pattern');
  await expect(sheet).toContainText('50413');
  await expect(sheet).toContainText('KSEA 16L');
  await page.getByLabel('Custom origin runway').selectOption('ENVA:27');
  await page.getByLabel('Custom destination runway').selectOption('ENGM:01L');
  await page.getByRole('button', { name: 'Load Route', exact: true }).click();
  await expect(sheet).toContainText('ENVA 27 / 270 deg true');
  await expect(sheet).toContainText('ENGM 01L');
  await expect(sheet).not.toContainText('141 / 149 / 155 kt');
  for (const [width, height] of [[1440, 900], [1100, 720], [720, 900]]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.locator('[data-rfs-zone="setup-dock"]').evaluate((dock) => {
      const controls = document.querySelector('[data-rfs-panel="controls"]');
      return { dockBottom: dock.getBoundingClientRect().bottom, controlsTop: controls?.getBoundingClientRect().top };
    });
    expect(bounds.controlsTop).toBeDefined();
    expect(bounds.dockBottom).toBeLessThanOrEqual(bounds.controlsTop ?? 0);
  }
  await page.getByRole('button', { name: 'Flight', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: /START ROLL/i })).toBeVisible();
});
