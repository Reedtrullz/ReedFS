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
    await expect(page.getByRole('status', { name: 'Route load result' })).toHaveText(
      'KSEA→KPDX route loaded. Confirm flaps 5, trim 5.0, idle throttle, then START ROLL.',
    );
    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    await expect(takeoffSetup).toBeVisible();
    await expect(takeoffSetup.getByRole('button', { name: 'Flaps Next' })).toBeVisible();
    await expect(takeoffSetup.getByRole('button', { name: 'Trim Nose Up' })).toBeVisible();
    await expect(takeoffSetup.getByRole('button', { name: 'Throttle Up' })).toBeVisible();
    await expect(takeoffSetup.getByLabel('Current takeoff configuration')).toContainText(/Flaps\s+\d+/);
    await expect(takeoffSetup.getByLabel('Current takeoff configuration')).toContainText(/Trim\s+-?\d+\.\d/);
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();

    await startRollThroughVisibleControls(page);
  });
});
