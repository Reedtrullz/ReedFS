import { expect, test } from '@playwright/test';
import {
  loadKseaRouteThroughVisibleControls,
  openRfsBlackbox,
  startRollThroughVisibleControls,
} from './helpers/rfsBlackbox';

test.describe('RFS black-box player loop proof', () => {
  test('loads and starts the KSEA route through visible browser controls only', async ({ page }) => {
    await openRfsBlackbox(page);
    await loadKseaRouteThroughVisibleControls(page);
    await startRollThroughVisibleControls(page);

    await expect(page.getByLabel('Route status').getByText('KSEA→KPDX')).toBeVisible();
  });
});
