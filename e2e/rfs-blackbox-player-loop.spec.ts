import { expect, test } from '@playwright/test';
import {
  configureTakeoffThroughVisibleControls,
  loadKseaRouteThroughVisibleControls,
  openRfsBlackbox,
  readVisibleFlightNumbers,
  rotateToPositiveRateThroughKeyboard,
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
    await expect(takeoffSetup.getByRole('button', { name: 'Flaps Next' })).toBeVisible();
    await expect(takeoffSetup.getByText('Trim 5.0')).toBeVisible();
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();

    await startRollThroughVisibleControls(page);
  });

  test('airborne legal MCP engagement shows AP and thrust ownership without hidden authority', async ({ page }) => {
    test.setTimeout(90_000);

    await openRfsBlackbox(page);
    await loadKseaRouteThroughVisibleControls(page);
    await startRollThroughVisibleControls(page);
    await configureTakeoffThroughVisibleControls(page);

    const pfd = page.getByLabel('Primary flight display');
    const lnav = page.getByRole('button', { name: /^LNAV$/ });
    const spd = page.getByRole('button', { name: /^SPD$/ });
    await expect(lnav).toBeEnabled();
    await expect(spd).toBeEnabled();
    await expect(lnav).toHaveAttribute('aria-pressed', 'false');
    await expect(spd).toHaveAttribute('aria-pressed', 'false');
    await expect(pfd.getByText('CMD_A', { exact: true })).toHaveCount(0);
    await expect(pfd.getByText('LNAV', { exact: true })).toHaveCount(0);
    await expect(pfd.getByText('SPEED', { exact: true })).toHaveCount(0);

    await rotateToPositiveRateThroughKeyboard(page);

    await lnav.click();
    await spd.click();

    await expect(lnav).toHaveAttribute('aria-pressed', 'true');
    await expect(spd).toHaveAttribute('aria-pressed', 'true');
    await expect(pfd.getByText('CMD_A', { exact: true })).toBeVisible();
    await expect(pfd.getByText('LNAV', { exact: true })).toBeVisible();
    await expect(pfd.getByText('SPEED', { exact: true })).toBeVisible();

    const numbers = await readVisibleFlightNumbers(page);
    expect(numbers.iasKt).toBeGreaterThan(120);
    expect(numbers.iasKt).toBeLessThan(230);
    expect(numbers.pitchDeg).toBeGreaterThan(-5);
    expect(numbers.pitchDeg).toBeLessThan(18);
    expect(numbers.verticalSpeedFpm).toBeGreaterThan(-500);
    expect(numbers.verticalSpeedFpm).toBeLessThan(6_000);
  });
});
