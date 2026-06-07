import type { Page } from '@playwright/test';

export async function openRfs(page: Page) {
  await page.goto('/');
  const viewport = page.getByTestId('cesium-viewport');
  await viewport.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-testid="cesium-viewport"]')?.getAttribute('data-rfs-ready') === 'true');
  await page.getByRole('button', { name: /START ROLL|ABORT/i }).waitFor({ state: 'visible' });
}

export async function clickButton(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name }).click();
  await page.waitForFunction(() => document.fonts?.status === 'loaded');
}

export async function startRoll(page: Page) {
  await clickButton(page, /START ROLL/i);
}

export async function cycleCameraTo(page: Page, label: 'COCKPIT' | 'TOWER' | 'CHASE') {
  const targetCameraButton = page.getByRole('button', { name: new RegExp(`CAM: ${label}`, 'i') });

  for (let i = 0; i < 4; i += 1) {
    if ((await targetCameraButton.count()) > 0) return;
    await clickButton(page, /CAM:/i);
  }

  if ((await targetCameraButton.count()) > 0) return;

  throw new Error(`Unable to cycle camera to ${label}`);
}
