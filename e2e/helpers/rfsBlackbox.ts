import { expect, type Page } from '@playwright/test';

export async function openRfsBlackbox(page: Page): Promise<void> {
  await page.goto('/');

  const viewport = page.getByTestId('cesium-viewport');
  await viewport.waitFor({ state: 'visible' });
  await expect(viewport).toHaveAttribute('data-rfs-ready', 'true', { timeout: 15_000 });
  await page.locator('canvas').nth(1).waitFor({ state: 'attached', timeout: 15_000 });
  await expect(page.getByRole('button', { name: /START ROLL|ABORT/i })).toBeVisible();
}

export async function loadKseaRouteThroughVisibleControls(page: Page): Promise<void> {
  await page.getByLabel('Scenario', { exact: true }).selectOption('ksea-tutorial');
  await page.getByRole('button', { name: /^LOAD PLAN$/ }).click();

  const routeStatus = page.getByLabel('Route status');
  await expect(routeStatus.getByText('KSEA→KPDX')).toBeVisible();
  await expect(routeStatus.getByText(/LEG\s+1\/3/)).toBeVisible();
  await expect(routeStatus.getByText('KSEA → OLM')).toBeVisible();
}

export async function startRollThroughVisibleControls(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^START ROLL$/ }).click();
  await expect(page.getByRole('button', { name: /^ABORT$/ })).toBeVisible();
}
