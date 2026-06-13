import { expect, test } from '@playwright/test';
import { clickButton, cycleCameraTo, openRfs, startRoll } from './helpers/rfsPage';

test.describe('RFS deterministic visual states', () => {
  test('initial runway/chase overlay is stable', async ({ page }) => {
    await openRfs(page);
    await expect(page.locator('[data-rfs-panel="pfd"]')).toBeVisible();
    await expect(page.locator('[data-rfs-panel="mcp"]')).toBeVisible();
    await expect(page.locator('[data-rfs-panel="controls"]')).toBeVisible();
    await expect(page).toHaveScreenshot('initial-chase.png', { fullPage: true, timeout: 10_000 });
  });

  test('cockpit mode keeps outside reference and instruments visible', async ({ page }) => {
    await openRfs(page);
    await cycleCameraTo(page, 'COCKPIT');
    await expect(page).toHaveScreenshot('cockpit-mode.png', { fullPage: true, timeout: 10_000 });
  });

  test('route overlay and safe AP modes are visible after LOAD PLAN', async ({ page }) => {
    await openRfs(page);
    await clickButton(page, /LOAD PLAN/i);
    await expect(page.getByLabel('Route status')).toContainText(/NO ROUTE|KSEA→KPDX/);
    await expect(page).toHaveScreenshot('route-loaded.png', { fullPage: true, timeout: 10_000 });
  });

  test('start roll state is visually stable', async ({ page }) => {
    await openRfs(page);
    await startRoll(page);
    await expect(page.getByText(/Set flaps 5, trim 5\.0, then advance takeoff thrust smoothly\./i)).toBeVisible();
    await expect(page).toHaveScreenshot('start-roll.png', { fullPage: true, timeout: 10_000 });
  });
});
