import type { Page } from '@playwright/test';

export async function openRfs(page: Page) {
  await page.goto('/');
  await page.getByTestId('cesium-viewport').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
}

export async function clickButton(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name }).click();
  await page.waitForTimeout(250);
}

export async function startRoll(page: Page) {
  await clickButton(page, /START ROLL/i);
}

export async function cycleCameraTo(page: Page, label: 'COCKPIT' | 'TOWER' | 'CHASE') {
  for (let i = 0; i < 3; i += 1) {
    const button = page.getByRole('button', { name: new RegExp(`CAM: ${label}`, 'i') });
    if ((await button.count()) > 0) return;
    await clickButton(page, /CAM:/i);
  }

  throw new Error(`Unable to cycle camera to ${label}`);
}
