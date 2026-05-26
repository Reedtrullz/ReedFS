import { expect, test } from '@playwright/test';
import { clickButton, cycleCameraTo, openRfs, startRoll } from './helpers/rfsPage';

test.describe('RFS deterministic visual states', () => {
  test('initial runway/chase overlay is stable', async ({ page }) => {
    await openRfs(page);
    await expect(page).toHaveScreenshot('initial-chase.png', { fullPage: true });
  });

  test('cockpit mode keeps outside reference and instruments visible', async ({ page }) => {
    await openRfs(page);
    await cycleCameraTo(page, 'COCKPIT');
    await expect(page).toHaveScreenshot('cockpit-mode.png', { fullPage: true });
  });

  test('route overlay and safe AP modes are visible after LOAD PLAN', async ({ page }) => {
    await openRfs(page);
    await clickButton(page, /LOAD PLAN/i);
    await expect(page).toHaveScreenshot('route-loaded.png', { fullPage: true });
  });

  test('start roll state is visually stable', async ({ page }) => {
    await openRfs(page);
    await startRoll(page);
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('start-roll.png', { fullPage: true });
  });
});
