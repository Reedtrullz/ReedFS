import { expect, test } from '@playwright/test';

import { fastForwardToPositiveRateThroughBrowserSim } from './helpers/rfsBrowserAssisted';
import {
  advanceTakeoffThrustThroughVisibleControls,
  configureTakeoffAirframeThroughVisibleControls,
  loadKseaRouteThroughVisibleControls,
  openRfsBlackbox,
  readVisibleFlightNumbers,
  startRollThroughVisibleControls,
} from './helpers/rfsBlackbox';

test.describe('RFS browser-assisted airborne MCP proof', () => {
  test('airborne MCP engagement shows AP and thrust ownership without hidden authority', async ({ page }) => {
    test.setTimeout(150_000);

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
    await fastForwardToPositiveRateThroughBrowserSim(page);

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
