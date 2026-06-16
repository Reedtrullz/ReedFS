import { expect, test, type Page } from '@playwright/test';
import { clickButton, cycleCameraTo, openRfs, startRoll } from './helpers/rfsPage';
import {
  expectDebugUiAppearsOnlyAfterExplicitOverlayControl,
  expectPlayerCockpitLayoutBoundaries,
  expectPrimaryPanelsDoNotCriticallyOverlap,
  RFS_LAYOUT_ASSERTION_VIEWPORTS,
} from './helpers/rfsVisualLayout';

declare const process: { env: Record<string, string | undefined> };

const SHOULD_COMPARE_SCREENSHOTS = process.env.VITE_RFS_VISUAL_TEST === '1';

async function expectVisualSnapshot(page: Page, name: string): Promise<void> {
  if (!SHOULD_COMPARE_SCREENSHOTS) return;
  await expect(page).toHaveScreenshot(name, { fullPage: true, timeout: 10_000 });
}

test.describe('RFS deterministic visual states', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('initial runway/chase overlay is stable', async ({ page }) => {
    await openRfs(page);
    await expect(page.locator('[data-rfs-panel="pfd"]')).toBeVisible();
    await expect(page.locator('[data-rfs-panel="mcp"]')).toBeVisible();
    await expect(page.locator('[data-rfs-panel="controls"]')).toBeVisible();
    await expectPrimaryPanelsDoNotCriticallyOverlap(page);
    await expectVisualSnapshot(page, 'initial-chase.png');
  });

  test('cockpit mode keeps outside reference and instruments visible', async ({ page }) => {
    await openRfs(page);
    await cycleCameraTo(page, 'COCKPIT');
    await expectPrimaryPanelsDoNotCriticallyOverlap(page);
    await expectVisualSnapshot(page, 'cockpit-mode.png');
  });

  test('route overlay and safe AP modes are visible after LOAD PLAN', async ({ page }) => {
    await openRfs(page);
    await page.getByLabel('Scenario', { exact: true }).selectOption('ksea-tutorial');
    await clickButton(page, /LOAD PLAN/i);
    await expect(page.getByLabel('Route status')).toContainText('KSEA→KPDX');
    await expect(page.getByLabel('Route status')).toContainText(/KSEA\s+→\s+OLM/);
    await expectPrimaryPanelsDoNotCriticallyOverlap(page);
    await expectVisualSnapshot(page, 'route-loaded.png');
  });

  test('start roll state is visually stable', async ({ page }) => {
    await page.clock.install();
    await openRfs(page);
    await startRoll(page);
    await expect(page.getByLabel('Coach status')).toContainText(/takeoff thrust|runway centerline/i);
    await expectPrimaryPanelsDoNotCriticallyOverlap(page);
    await expectVisualSnapshot(page, 'start-roll.png');
  });

  test('player cockpit layout boundaries hold across desktop viewports', async ({ page }) => {
    test.setTimeout(120_000);

    for (const viewport of RFS_LAYOUT_ASSERTION_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openRfs(page);
      await expectPlayerCockpitLayoutBoundaries(page, `${viewport.name} chase`);

      await cycleCameraTo(page, 'COCKPIT');
      await expectPlayerCockpitLayoutBoundaries(page, `${viewport.name} cockpit`);
    }
  });

  test('normal player mode hides debug overlays until explicit opt-in', async ({ page }) => {
    await openRfs(page);
    await expectDebugUiAppearsOnlyAfterExplicitOverlayControl(page);
  });
});
