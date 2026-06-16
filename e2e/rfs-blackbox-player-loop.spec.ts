import { expect, test } from '@playwright/test';
import {
  advanceTakeoffThrustThroughVisibleControls,
  clickVisibleMcpMode,
  cleanUpAirframeThroughVisibleControls,
  configureTakeoffAirframeThroughVisibleControls,
  driveVisibleSimUntil,
  holdKey,
  expectVisibleEngineStripCommand,
  loadKseaRouteThroughVisibleControls,
  openRfsBlackbox,
  readVisibleFlightNumbers,
  resetThroughVisibleControls,
  rotateWithVisibleMouseControlToPositiveRate,
  rotateToVisiblePositiveRate,
  setVisibleMcpAltitudeAtLeast,
  setVisibleSimRateTarget,
  startRollThroughVisibleControls,
  toggleVisibleGearThroughKeyboardControls,
  toggleVisibleGearThroughMouseOnlyControls,
  waitForVisibleFlightPhase,
  waitForVisibleFmaModes,
} from './helpers/rfsBlackbox';

test.describe('RFS black-box player loop proof', () => {
  test('KSEA route load shows visible takeoff setup before manual start', async ({ page }) => {
    await openRfsBlackbox(page);
    await loadKseaRouteThroughVisibleControls(page);

    await expect(page.getByLabel('Route status').getByText('KSEA→KPDX')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Route load result' })).toHaveText(
      'CANNED TRAINING ROUTE KSEA→KPDX loaded. Route editing is unavailable; synthetic approach fixes are not official procedure data; confirm flaps 5, trim 5.0, idle throttle, then START ROLL.',
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
  test('KSEA route takeoff reaches positive rate, gear up, and reset through keyboard controls', async ({ page }) => {
    test.setTimeout(360_000);

    await page.clock.install();
    await openRfsBlackbox(page);
    await setVisibleSimRateTarget(page, 16);
    await loadKseaRouteThroughVisibleControls(page);

    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    const currentConfig = takeoffSetup.getByLabel('Current takeoff configuration');
    await takeoffSetup.getByRole('button', { name: /Set takeoff config/i }).click();
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);
    await expect(currentConfig).toContainText(/Throttle\s+0%/);

    await startRollThroughVisibleControls(page);
    await holdKey(page, 'ArrowUp', 20);
    await expectVisibleEngineStripCommand(page, {
      throttlePercent: 100,
      flapCommandDeg: 5,
      gearCommand: 'DN',
    });

    await driveVisibleSimUntil(page, 'visible takeoff speed for rotation', async () => {
      return (await readVisibleFlightNumbers(page)).iasKt >= 145;
    }, {
      timeoutMs: 120_000,
      stepMs: 1000,
    });
    await rotateToVisiblePositiveRate(page);
    expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);
    await expect(page.getByRole('region', { name: 'Scenario and tutorial' }).getByText('Positive rate established')).toBeVisible();

    await toggleVisibleGearThroughKeyboardControls(page, 'UP');
    await expectVisibleEngineStripCommand(page, {
      gearCommand: 'UP',
      gearActual: /GEAR ACT\s*(?:TRN\s*\d+%|UP)/,
    });

    const resetButton = page.getByRole('button', { name: /^RESET$/ });
    await expect(resetButton).toBeVisible();
    await resetButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();
  });

  test('KSEA route mouse-visible controls expose blocked gear feedback and complete takeoff/reset', async ({ page }) => {
    test.setTimeout(360_000);

    await page.clock.install();
    await openRfsBlackbox(page);
    await setVisibleSimRateTarget(page, 16);
    await loadKseaRouteThroughVisibleControls(page);

    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    const currentConfig = takeoffSetup.getByLabel('Current takeoff configuration');
    await configureTakeoffAirframeThroughVisibleControls(page);
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);

    await startRollThroughVisibleControls(page);
    const gearButton = takeoffSetup.getByRole('button', { name: /^Gear$/ });
    await expect(gearButton).toBeVisible();
    await gearButton.dispatchEvent('click');
    await expect(currentConfig).toContainText(/Gear\s+DOWN/);
    await expect(page.getByRole('status', { name: 'Control feedback' })).toContainText(
      /gear up blocked.*positive rate/i,
    );

    await advanceTakeoffThrustThroughVisibleControls(page);
    await driveVisibleSimUntil(page, 'visible mouse-only takeoff speed for rotation', async () => {
      return (await readVisibleFlightNumbers(page)).iasKt >= 145;
    }, {
      timeoutMs: 120_000,
      stepMs: 1000,
    });
    await rotateWithVisibleMouseControlToPositiveRate(page);
    expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);

    await toggleVisibleGearThroughMouseOnlyControls(page, 'UP');
    await expectVisibleEngineStripCommand(page, {
      gearCommand: 'UP',
      gearActual: /GEAR ACT\s*(?:TRN\s*\d+%|UP)/,
    });
    await resetThroughVisibleControls(page);
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();
  });

  test('visible LNAV SPD ALT engagement after positive rate stays backed and recoverable', async ({ page }) => {
    test.setTimeout(360_000);

    await page.clock.install();
    await openRfsBlackbox(page);
    await setVisibleSimRateTarget(page, 16);
    await loadKseaRouteThroughVisibleControls(page);

    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    const currentConfig = takeoffSetup.getByLabel('Current takeoff configuration');
    await takeoffSetup.getByRole('button', { name: /Set takeoff config/i }).click();
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);
    await expect(currentConfig).toContainText(/Throttle\s+0%/);

    await startRollThroughVisibleControls(page);
    await holdKey(page, 'ArrowUp', 20);
    await expectVisibleEngineStripCommand(page, {
      throttlePercent: 100,
      flapCommandDeg: 5,
      gearCommand: 'DN',
    });

    await driveVisibleSimUntil(page, 'visible takeoff speed for rotation', async () => {
      return (await readVisibleFlightNumbers(page)).iasKt >= 145;
    }, {
      timeoutMs: 120_000,
      stepMs: 1000,
    });
    await rotateToVisiblePositiveRate(page);
    expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);

    await cleanUpAirframeThroughVisibleControls(page);
    await expectVisibleEngineStripCommand(page, {
      flapCommandDeg: 0,
    });
    await setVisibleSimRateTarget(page, 1);

    await clickVisibleMcpMode(page, 'LNAV');
    await clickVisibleMcpMode(page, 'SPD');
    const currentAltitudeFt = (await readVisibleFlightNumbers(page)).altitudeFt;
    const altitudeTargetFt = Math.ceil((currentAltitudeFt + 1000) / 1000) * 1000;
    await setVisibleMcpAltitudeAtLeast(page, altitudeTargetFt);
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

    await resetThroughVisibleControls(page);
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();
  });
});
