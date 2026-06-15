import { expect, test } from '@playwright/test';
import {
  clickVisibleMcpMode,
  holdKey,
  loadKseaRouteThroughVisibleControls,
  openRfsBlackbox,
  sampleVisibleVerticalSpeeds,
  startRollThroughVisibleControls,
  waitForVisibleAirspeedAtLeast,
  waitForVisibleFmaModes,
  waitForVisiblePitchAtLeast,
  waitForVisiblePositiveRate,
} from './helpers/rfsBlackbox';

test.describe('RFS black-box player loop proof', () => {
  test('KSEA route load shows visible takeoff setup before manual start', async ({ page }) => {
    await openRfsBlackbox(page);
    await loadKseaRouteThroughVisibleControls(page);

    await expect(page.getByLabel('Route status').getByText('KSEA→KPDX')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Route load result' })).toHaveText(
      'CANNED TRAINING ROUTE KSEA→KPDX loaded. Route editing is unavailable; confirm flaps 5, trim 5.0, idle throttle, then START ROLL.',
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
  test('KSEA route takeoff reaches positive rate and gear up through visible controls', async ({ page }) => {
    test.setTimeout(180_000);

    await openRfsBlackbox(page);
    await loadKseaRouteThroughVisibleControls(page);

    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    const currentConfig = takeoffSetup.getByLabel('Current takeoff configuration');
    await takeoffSetup.getByRole('button', { name: /Set takeoff config/i }).click();
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);
    await expect(currentConfig).toContainText(/Throttle\s+0%/);

    await startRollThroughVisibleControls(page);
    await holdKey(page, 'ArrowUp', 20);
    await expect(currentConfig).toContainText(/Throttle\s+100%/);

    await waitForVisibleAirspeedAtLeast(page, 145);
    await holdKey(page, 'KeyW', 30);
    await waitForVisiblePitchAtLeast(page, 5);
    await waitForVisiblePositiveRate(page);

    await takeoffSetup.getByRole('button', { name: /^Gear$/ }).click();
    await expect(currentConfig).toContainText(/Gear\s+UP/);
    await expect(page.getByText(/GEAR CMD\s*UP/).first()).toBeVisible();
    await expect(page.getByText(/GEAR ACT\s*(?:TRN\s*\d+%|UP)/).first()).toBeVisible();
  });

  test('stable visible LNAV SPD ALT engagement after positive rate stays truthful and controlled', async ({ page }) => {
    test.setTimeout(210_000);

    await openRfsBlackbox(page);
    await loadKseaRouteThroughVisibleControls(page);

    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    const currentConfig = takeoffSetup.getByLabel('Current takeoff configuration');
    await takeoffSetup.getByRole('button', { name: /Set takeoff config/i }).click();
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);
    await expect(currentConfig).toContainText(/Throttle\s+0%/);

    await startRollThroughVisibleControls(page);
    await holdKey(page, 'ArrowUp', 20);
    await expect(currentConfig).toContainText(/Throttle\s+100%/);

    await waitForVisibleAirspeedAtLeast(page, 145);
    await holdKey(page, 'KeyW', 30);
    await waitForVisiblePitchAtLeast(page, 5);
    await waitForVisiblePositiveRate(page);

    await takeoffSetup.getByRole('button', { name: /^Gear$/ }).click();
    await expect(currentConfig).toContainText(/Gear\s+UP/);

    await clickVisibleMcpMode(page, 'LNAV');
    await clickVisibleMcpMode(page, 'SPD');
    await clickVisibleMcpMode(page, 'ALT');

    const engagedFma = await waitForVisibleFmaModes(page, {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: /^(ALT\*|ALT_HOLD)$/,
      autopilotStatus: 'CMD_A',
    });
    expect(`PITCH ${engagedFma.verticalActive} / ${engagedFma.autopilotStatus}`).not.toBe('PITCH OFF / CMD_A');
    expect(engagedFma.verticalActive).not.toBe('OFF');
    expect(engagedFma.verticalActive).toMatch(/^(ALT\*|ALT_HOLD)$/);
    await expect(page.getByLabel('Altitude selected bug')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Autopilot authority warning' })).toHaveCount(0);

    const verticalSpeeds = await sampleVisibleVerticalSpeeds(page, 8, 750);
    expect(Math.min(...verticalSpeeds)).toBeGreaterThan(-1500);
  });
});
