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
      'KSEA→KPDX route loaded. Takeoff setup reminder: confirm flaps for takeoff, set takeoff trim, keep throttle idle until ready, then press START ROLL.',
    );
    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    await expect(takeoffSetup).toBeVisible();
    await expect(takeoffSetup.getByRole('button', { name: 'Flaps Up' })).toBeVisible();
    await expect(takeoffSetup.getByText('Trim 5.0')).toBeVisible();
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();

    await startRollThroughVisibleControls(page);
  });
});
