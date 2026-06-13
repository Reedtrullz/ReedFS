import { expect, test } from '@playwright/test';
import {
  loadKseaRouteThroughVisibleControls,
  openRfsBlackbox,
  startRollThroughVisibleControls,
} from './helpers/rfsBlackbox';

test.describe('RFS black-box player loop proof', () => {
  test('KSEA route load shows visible takeoff setup before manual start', async ({ page }) => {
    await openRfsBlackbox(page);
    await loadKseaRouteThroughVisibleControls(page);

    await expect(page.getByLabel('Route status').getByText('KSEA→KPDX')).toBeVisible();
    await expect(page.getByRole('status').getByText('KSEA→KPDX route loaded')).toBeVisible();
    await expect(page.getByRole('status').getByText(/flaps.*takeoff/i)).toBeVisible();
    await expect(page.getByRole('status').getByText(/trim.*takeoff/i)).toBeVisible();
    await expect(page.getByRole('status').getByText(/throttle.*idle/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();

    await startRollThroughVisibleControls(page);
  });
});
