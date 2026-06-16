import { expect, test } from '@playwright/test';
import {
  advanceTakeoffThrustThroughVisibleControls,
  cleanUpAirframeThroughVisibleControls,
  clickVisibleMcpMode,
  configureScenarioTakeoffThroughVisibleControls,
  driveVisibleSimUntil,
  idleThrustThroughVisibleControls,
  loadSelectedRouteThroughVisibleControls,
  openRfsBlackbox,
  readVisibleFlightNumbers,
  readVisibleFlightPhase,
  readVisibleFmaModes,
  readVisibleRouteStatus,
  resetThroughVisibleControls,
  rotateToVisiblePositiveRate,
  selectKpdxShortFinalScenarioThroughVisibleControls,
  selectKseaScenarioThroughVisibleControls,
  setVisibleMcpAltitudeAtLeast,
  setVisibleMcpSpeedAtLeast,
  setVisibleMcpVerticalSpeed,
  setVisibleSimRateTarget,
  startRollThroughVisibleControls,
  toggleVisibleGearThroughVisibleControls,
  waitForVisibleFlightPhase,
  waitForVisibleFmaModes,
} from './helpers/rfsBlackbox';

test.describe('RFS full flight black-box acceptance', () => {
  test.describe.configure({ retries: 0 });

  test('visible route setup, backed climb smoke, and KPDX short-final landing rollout reset use visible controls only', async ({ page }) => {
    test.setTimeout(720_000);

    await page.clock.install();
    await openRfsBlackbox(page);
    await setVisibleSimRateTarget(page, 16);

    await selectKseaScenarioThroughVisibleControls(page);
    await expect(page.getByLabel('Route status')).toContainText('NO ROUTE');
    await loadSelectedRouteThroughVisibleControls(page);

    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    const currentConfig = takeoffSetup.getByLabel('Current takeoff configuration');
    await configureScenarioTakeoffThroughVisibleControls(page);
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);
    await expect(currentConfig).toContainText(/Throttle\s+0%/);
    await expect(currentConfig).toContainText(/Gear\s+DOWN/);

    await startRollThroughVisibleControls(page);
    await advanceTakeoffThrustThroughVisibleControls(page);
    await driveVisibleSimUntil(page, 'visible takeoff speed for deliberate rotation', async () => {
      return (await readVisibleFlightNumbers(page)).iasKt >= 145;
    }, {
      timeoutMs: 120_000,
      stepMs: 1000,
    });
    await rotateToVisiblePositiveRate(page);
    expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);
    await expect(page.getByRole('region', { name: 'Scenario and tutorial' }).getByText('Positive rate established')).toBeVisible();

    await toggleVisibleGearThroughVisibleControls(page, 'UP');
    await expect(currentConfig).toContainText(/Gear\s+UP/);
    await cleanUpAirframeThroughVisibleControls(page);
    await expect(currentConfig).toContainText(/Flaps\s+0/);

    const initialRoute = await readVisibleRouteStatus(page);
    expect(initialRoute.activeLegIndex).toBe(1);
    expect(initialRoute.activeLegCount).toBe(5);
    expect(initialRoute.distanceToGoNm).not.toBeNull();
    const climbTargetFt = await setVisibleMcpAltitudeAtLeast(page, 15_000);
    expect(climbTargetFt).toBeGreaterThanOrEqual(15_000);
    const climbSpeedKt = await setVisibleMcpSpeedAtLeast(page, 240);
    expect(climbSpeedKt).toBeGreaterThanOrEqual(240);
    await clickVisibleMcpMode(page, 'LNAV');
    await clickVisibleMcpMode(page, 'SPD');
    await clickVisibleMcpMode(page, 'VS');
    await setVisibleMcpVerticalSpeed(page, 1500);
    await waitForVisibleFmaModes(page, {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: 'VS',
      autopilotStatus: 'CMD_A',
    });
    await expect(page.getByLabel('PFD MCP selected targets')).toContainText(/SEL VS \+?1500/);
    await expect(page.getByRole('status', { name: 'Autopilot authority warning' })).toHaveCount(0);
    const enrouteRoute = await readVisibleRouteStatus(page);
    expect(enrouteRoute.text).toMatch(/KSEA→KPDX/);
    expect(enrouteRoute.distanceToGoNm).not.toBeNull();
    expect(enrouteRoute.text).not.toMatch(/LNAV unavailable/i);
    expect(await readVisibleFmaModes(page)).toEqual({
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: 'VS',
      autopilotStatus: 'CMD_A',
    });

    await resetThroughVisibleControls(page);
    await expect(page.getByLabel('Route status')).toContainText('NO ROUTE');
    await selectKpdxShortFinalScenarioThroughVisibleControls(page);
    await setVisibleSimRateTarget(page, 16);
    await expect(currentConfig).toContainText(/Gear\s+DOWN/);
    await expect(currentConfig).toContainText(/Flaps\s+30/);
    await expect(currentConfig).toContainText(/Throttle\s+35%/);

    await startRollThroughVisibleControls(page);
    await expect(await waitForVisibleFlightPhase(page, /^APPROACH$/)).toBe('APPROACH');
    let approachPhase = await readVisibleFlightPhase(page);
    await driveVisibleSimUntil(page, 'visible KPDX short-final approach lifecycle', async () => {
      approachPhase = await readVisibleFlightPhase(page);
      return /^(TOUCHDOWN|DEROTATION|ROLLOUT|TAXI)$/.test(approachPhase);
    }, {
      timeoutMs: 180_000,
      stepMs: 500,
    });
    expect(approachPhase).toMatch(/^(TOUCHDOWN|DEROTATION|ROLLOUT|TAXI)$/);

    const landingPhase = approachPhase;
    expect(landingPhase).toMatch(/^(TOUCHDOWN|DEROTATION|ROLLOUT|TAXI)$/);
    await idleThrustThroughVisibleControls(page);
    await expect(currentConfig).toContainText(/Throttle\s+0%/);
    await page.mouse.click(20, 20);
    await page.keyboard.down('Space');
    try {
      await driveVisibleSimUntil(page, 'visible STOPPED phase while holding wheel brakes', async () => {
        return (await readVisibleFlightPhase(page)) === 'STOPPED';
      }, {
        timeoutMs: 180_000,
        stepMs: 500,
      });
    } finally {
      await page.keyboard.up('Space');
    }
    expect(await readVisibleFlightPhase(page)).toBe('STOPPED');
    await expect(page.getByLabel('Coach status')).toContainText(/reset/i);

    await resetThroughVisibleControls(page);
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();
    await expect(page.getByLabel('Route status')).toContainText('NO ROUTE');
    await expect(currentConfig).toContainText(/Flaps\s+30/);
    await expect(currentConfig).toContainText(/Trim\s+4\.8/);
    await expect(currentConfig).toContainText(/Throttle\s+35%/);
    await expect(currentConfig).toContainText(/Gear\s+DOWN/);
    expect(await readVisibleFlightPhase(page)).toBe('APPROACH');
    expect(await readVisibleFmaModes(page)).toEqual({
      thrustActive: 'OFF',
      lateralActive: 'OFF',
      verticalActive: 'OFF',
      autopilotStatus: 'OFF',
    });
  });
});
