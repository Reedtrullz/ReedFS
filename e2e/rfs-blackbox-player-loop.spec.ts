import { expect, test } from '@playwright/test';
import {
  advanceTakeoffThrustThroughVisibleControls,
  configureTakeoffAirframeThroughVisibleControls,
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

    const pfd = page.getByLabel('Primary flight display');
    const mcp = page.getByRole('region', { name: 'Mode control panel' });
    const lnav = mcp.getByRole('button', { name: /^LNAV$/ });
    const spd = mcp.getByRole('button', { name: /^SPD$/ });
    await expect(lnav).toHaveAttribute('aria-disabled', 'true');
    await expect(spd).toHaveAttribute('aria-disabled', 'true');
    await expect(lnav).toHaveAttribute('aria-pressed', 'false');
    await expect(spd).toHaveAttribute('aria-pressed', 'false');
    await expect(pfd.getByText('CMD_A', { exact: true })).toHaveCount(0);
    await expect(pfd.getByText('LNAV', { exact: true })).toHaveCount(0);
    await expect(pfd.getByText('SPEED', { exact: true })).toHaveCount(0);

    await startRollThroughVisibleControls(page);
    await configureTakeoffAirframeThroughVisibleControls(page);
    await advanceTakeoffThrustThroughVisibleControls(page);
    await rotateToPositiveRateThroughKeyboard(page);

    await expect(lnav).toHaveAttribute('aria-disabled', 'false');
    await expect(spd).toHaveAttribute('aria-disabled', 'false');

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
    expect(numbers.radioAltitudeFt).not.toBeNull();
    expect(numbers.radioAltitudeFt).toBeGreaterThan(20);
    expect(numbers.verticalSpeedFpm).toBeGreaterThan(-2_000);
    expect(numbers.verticalSpeedFpm).toBeLessThan(6_000);
  });
});
