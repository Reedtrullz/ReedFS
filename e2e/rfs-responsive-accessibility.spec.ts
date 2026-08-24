import { expect, test, type Page } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';

type Box = {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const FLIGHT_VIEWPORTS = [
  { width: 900, height: 700 },
  { width: 1024, height: 700 },
  { width: 1280, height: 720 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;
const DEBUG_VIEWPORTS = [
  { width: 1024, height: 700 },
  { width: 1280, height: 720 },
] as const;
const MIN_PANEL_GAP_PX = 2;

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

async function panelBoxes(page: Page, requiredPanels: string[], optionalPanels: string[] = []): Promise<Box[]> {
  const result = await page.evaluate(({ requiredPanels: required, optionalPanels: optional }) => {
    function collect(name: string): Box | null {
      const node = document.querySelector<HTMLElement>(`[data-rfs-panel="${name}"]`);
      if (!node) return null;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity) === 0
        || rect.width <= 0
        || rect.height <= 0
      ) {
        return null;
      }
      return {
        name,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }

    return {
      required: required.map((name) => ({ name, box: collect(name) })),
      optional: optional.map(collect).filter((box): box is Box => box !== null),
    };
  }, { requiredPanels, optionalPanels });

  for (const { name, box } of result.required) {
    expect(box, `RFS panel ${name} bounding box`).not.toBeNull();
  }

  return [
    ...result.required.map(({ box }) => box as Box),
    ...result.optional,
  ];
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
  const boxes = await panelBoxes(
    page,
    ['scenario', 'route-builder', 'takeoff-setup', 'route', 'pfd', 'mcp', 'engine', 'controls'],
    ['scene-status'],
  );
  const creditBoxes = await visibleCesiumCreditBoxes(page);
  expect(creditBoxes.length, 'visible Cesium attribution/credit boxes').toBeGreaterThan(0);
  return [...boxes, ...creditBoxes];
}

async function cycleOverlayToDebug(page: Page): Promise<void> {
  await page.keyboard.press('o');
  await page.keyboard.press('o');
  await expect(page.getByRole('button', { name: /OVL: DEBUG/i })).toBeVisible();
}

async function clickResponsiveControl(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name }).click();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function configureTakeoffAndLoadRoute(page: Page): Promise<void> {
  await clickResponsiveControl(page, /^Set takeoff config$/i);
  await clickResponsiveControl(page, /^LOAD PLAN$/i);
  await expect(page.getByRole('status', { name: 'Route load result' })).toContainText(/loaded/i);
}

async function setViewportAndSettle(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test.describe('RFS responsive layout and attribution safety', () => {
  test.describe.configure({ timeout: 120_000 });

  test('flight overlay panels, debug panels, and Cesium attribution stay clear across responsive route-loaded states', async ({ page }) => {
    await setViewportAndSettle(page, { width: 1280, height: 900 });
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
    await clickResponsiveControl(page, /^LOAD PLAN$/);
    await expect(page.getByRole('status', { name: 'Route load result' })).toContainText(/KSEA→KPDX loaded/i);

    await page.getByLabel('Scenario', { exact: true }).selectOption('enva-tutorial');
    await configureTakeoffAndLoadRoute(page);
    await expect(page.getByRole('status', { name: 'Route load result' })).toContainText(/ENVA→ENGM loaded/i);

    for (const viewport of FLIGHT_VIEWPORTS) {
      await setViewportAndSettle(page, viewport);
      expectNoOverlap(await flightModeBoxes(page));
    }

    await cycleOverlayToDebug(page);
    await expect(page.locator('[data-rfs-panel="debug"]')).toBeVisible();

    for (const viewport of DEBUG_VIEWPORTS) {
      await setViewportAndSettle(page, viewport);
      const boxes = await panelBoxes(page, ['debug', 'scenario', 'route-builder', 'takeoff-setup', 'route', 'pfd', 'mcp', 'controls']);
      expectNoOverlap([...boxes, ...(await visibleCesiumCreditBoxes(page))]);
    }
  });
});
