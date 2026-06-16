import { expect, test, type Page } from '@playwright/test';
import { clickButton, openRfs } from './helpers/rfsPage';

type Box = {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const FLIGHT_VIEWPORT_WIDTHS = [1024, 1280, 1440, 1920] as const;
const VIEWPORT_HEIGHT = 900;
const MIN_PANEL_GAP_PX = 2;

async function panelBox(page: Page, panel: string): Promise<Box> {
  const locator = page.locator(`[data-rfs-panel="${panel}"]`);
  await expect(locator, `RFS panel ${panel}`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `RFS panel ${panel} bounding box`).not.toBeNull();
  return {
    name: panel,
    left: box!.x,
    top: box!.y,
    right: box!.x + box!.width,
    bottom: box!.y + box!.height,
    width: box!.width,
    height: box!.height,
  };
}

async function visibleCesiumCreditBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const selectors = [
      '.cesium-credit-logoContainer',
      '.cesium-credit-textContainer',
      '.cesium-credit-expand-link',
    ];
    const boxes: Box[] = [];
    for (const selector of selectors) {
      document.querySelectorAll<HTMLElement>(selector).forEach((node, index) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || Number(style.opacity) === 0
          || rect.width <= 0
          || rect.height <= 0
        ) {
          return;
        }
        boxes.push({
          name: `cesium-credit:${selector}:${index}`,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });
      });
    }
    return boxes;
  });
}

function overlapPixels(a: Box, b: Box): { x: number; y: number } {
  return {
    x: Math.min(a.right, b.right) - Math.max(a.left, b.left),
    y: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
  };
}

function expectNoOverlap(boxes: Box[]): void {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = overlapPixels(a, b);
      expect(
        overlap.x > MIN_PANEL_GAP_PX && overlap.y > MIN_PANEL_GAP_PX,
        `${a.name} overlaps ${b.name} by ${overlap.x.toFixed(1)}×${overlap.y.toFixed(1)} px\n${JSON.stringify({ a, b }, null, 2)}`,
      ).toBe(false);
    }
  }
}

async function flightModeBoxes(page: Page): Promise<Box[]> {
  const boxes = await Promise.all([
    panelBox(page, 'scenario'),
    panelBox(page, 'takeoff-setup'),
    panelBox(page, 'route'),
    panelBox(page, 'pfd'),
    panelBox(page, 'mcp'),
    panelBox(page, 'engine'),
    panelBox(page, 'controls'),
  ]);
  const creditBoxes = await visibleCesiumCreditBoxes(page);
  expect(creditBoxes.length, 'visible Cesium attribution/credit boxes').toBeGreaterThan(0);
  return [...boxes, ...creditBoxes];
}

async function cycleOverlayToDebug(page: Page): Promise<void> {
  await page.keyboard.press('o');
  await page.keyboard.press('o');
  await expect(page.getByRole('button', { name: /OVL: DEBUG/i })).toBeVisible();
}

test.describe('RFS responsive layout and attribution safety', () => {
  test.describe.configure({ timeout: 60_000 });

  for (const width of FLIGHT_VIEWPORT_WIDTHS) {
    test(`flight overlay panels and Cesium attribution do not overlap at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await openRfs(page);
      await clickButton(page, /LOAD PLAN/i);

      expectNoOverlap(await flightModeBoxes(page));
    });
  }

  for (const width of [1024, 1280] as const) {
    test(`debug overlay remains inside the responsive layout and avoids primary panels at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await openRfs(page);
      await cycleOverlayToDebug(page);
      await expect(page.locator('[data-rfs-panel="debug"]')).toBeVisible();

      const boxes = await Promise.all([
        panelBox(page, 'debug'),
        panelBox(page, 'scenario'),
        panelBox(page, 'takeoff-setup'),
        panelBox(page, 'route'),
        panelBox(page, 'pfd'),
        panelBox(page, 'mcp'),
        panelBox(page, 'controls'),
      ]);
      expectNoOverlap([...boxes, ...(await visibleCesiumCreditBoxes(page))]);
    });
  }

  test('landmarks expose named simulator regions, button states, and live status', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT });
    await openRfs(page);

    await expect(page.getByRole('main', { name: /reed flight simulator/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /reed flight simulator/i, level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: /scenario and tutorial/i })).toBeVisible();
    await expect(page.getByRole('region', { name: /takeoff setup/i })).toBeVisible();
    await expect(page.getByRole('region', { name: /route status/i })).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByRole('region', { name: /primary flight display/i })).toBeVisible();
    await expect(page.getByRole('region', { name: /mode control panel/i })).toBeVisible();
    await expect(page.getByRole('region', { name: /simulator controls/i })).toBeVisible();

    await expect(page.getByRole('button', { name: /^LNAV$/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: /^LNAV$/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: /^FD L$/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: /^AUDIO: OFF$/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: /^OVL: FLIGHT$/ })).toHaveAttribute('aria-pressed', 'true');

    await expect(page.getByLabel('Coach status')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByLabel('Route status')).toHaveAttribute('aria-live', 'polite');

    await page.getByLabel('Scenario', { exact: true }).selectOption('ksea-tutorial');
    await clickButton(page, /^LOAD PLAN$/);
    await expect(page.getByRole('status', { name: 'Route load result' })).toContainText(/KSEA→KPDX loaded/i);
  });
});
