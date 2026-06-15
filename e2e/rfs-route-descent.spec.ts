import { expect, test } from '@playwright/test';
import {
  advanceTakeoffThrustThroughVisibleControls,
  advanceVisibleSimTime,
  cleanUpAirframeThroughVisibleControls,
  clickVisibleMcpMode,
  driveVisibleSimUntil,
  idleThrustThroughVisibleControls,
  loadSelectedRouteThroughVisibleControls,
  openRfsBlackbox,
  readVisibleFlightNumbers,
  readVisibleFlightPhase,
  readVisibleRouteStatus,
  rotateToVisiblePositiveRate,
  selectKseaScenarioThroughVisibleControls,
  setVisibleMcpAltitudeAtLeast,
  setVisibleMcpVerticalSpeed,
  startRollThroughVisibleControls,
  waitForVisibleCoachText,
  waitForVisibleFlightPhase,
  waitForVisibleFmaModes,
} from './helpers/rfsBlackbox';

test.describe('RFS visible route descent proof', () => {
  test('visible descent workflow uses route progress and MCP controls without direct state seeding', async ({ page }) => {
    test.setTimeout(360_000);

    await page.clock.install();
    await openRfsBlackbox(page);
    await page.getByRole('button', { name: /Cycle simulator rate/ }).click();
    await expect(page.getByRole('button', { name: /Cycle simulator rate/ })).toHaveText('SIM RATE TARGET: 4X');
    await page.getByRole('button', { name: /Cycle simulator rate/ }).click();
    await expect(page.getByRole('button', { name: /Cycle simulator rate/ })).toHaveText('SIM RATE TARGET: 16X');
    await selectKseaScenarioThroughVisibleControls(page);
    await expect(page.getByLabel('Route status')).toContainText('NO ROUTE');

    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    const currentConfig = takeoffSetup.getByLabel('Current takeoff configuration');
    await takeoffSetup.getByRole('button', { name: /Set takeoff config/i }).click();
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);

    await startRollThroughVisibleControls(page);
    await advanceTakeoffThrustThroughVisibleControls(page);
    await driveVisibleSimUntil(page, 'visible takeoff speed for rotation', async () => {
      return (await readVisibleFlightNumbers(page)).iasKt >= 145;
    }, {
      timeoutMs: 120_000,
      stepMs: 1000,
    });

    await rotateToVisiblePositiveRate(page);
    expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);
    const gearButton = takeoffSetup.getByRole('button', { name: /^Gear$/ });
    await expect(gearButton).toBeVisible();
    await gearButton.dispatchEvent('click');
    await expect(currentConfig).toContainText(/Gear\s+UP/);
    await cleanUpAirframeThroughVisibleControls(page);

    await loadSelectedRouteThroughVisibleControls(page);
    await expect(page.getByRole('status', { name: 'Route load result' })).toHaveText(
      'CANNED TRAINING ROUTE KSEA→KPDX loaded. Route editing is unavailable; route guidance is active; use visible MCP LNAV, altitude, and VS/VNAV controls for climb/descent management.',
    );
    const initialRoute = await readVisibleRouteStatus(page);
    expect(initialRoute.distanceToGoNm).not.toBeNull();

    const climbTargetFt = await setVisibleMcpAltitudeAtLeast(page, 15_000);
    expect(climbTargetFt).toBeGreaterThanOrEqual(15_000);
    await clickVisibleMcpMode(page, 'LNAV');
    await clickVisibleMcpMode(page, 'ALT');
    await waitForVisibleFmaModes(page, {
      lateralActive: 'LNAV',
      verticalActive: /^(ALT\*|ALT_HOLD)$/,
      autopilotStatus: 'CMD_A',
    });

    await idleThrustThroughVisibleControls(page);
    await clickVisibleMcpMode(page, 'VS');
    await setVisibleMcpVerticalSpeed(page, -900);
    await waitForVisibleFmaModes(page, {
      lateralActive: 'LNAV',
      verticalActive: 'VS',
      autopilotStatus: 'CMD_A',
    });
    await expect(page.getByLabel('PFD MCP selected targets')).toContainText('SEL VS -900');
    const preDescentResponse = await readVisibleFlightNumbers(page);
    await advanceVisibleSimTime(page, 5_000);
    expect((await readVisibleFlightNumbers(page)).altitudeFt).toBeLessThan(preDescentResponse.altitudeFt);

    await driveVisibleSimUntil(page, 'visible route progress toward KPDX and descent phase entry', async () => {
      const route = await readVisibleRouteStatus(page);
      if (route.distanceToGoNm === null || initialRoute.distanceToGoNm === null) return false;
      const phase = await readVisibleFlightPhase(page);
      return /^(DESCENT|APPROACH)$/.test(phase) && route.distanceToGoNm < initialRoute.distanceToGoNm - 0.5;
    }, {
      timeoutMs: 240_000,
      stepMs: 1000,
    });

    const descentCoach = await waitForVisibleCoachText(page, /^Descent:/i);
    expect(descentCoach).toMatch(/route descent path/i);
    expect(await waitForVisibleFlightPhase(page, /^(DESCENT|APPROACH)$/)).toMatch(/^(DESCENT|APPROACH)$/);
    await expect(page.getByRole('region', { name: 'Scenario and tutorial' }).getByText('Descent established')).toBeVisible();

    const descentRoute = await readVisibleRouteStatus(page);
    expect(descentRoute.distanceToGoNm).not.toBeNull();
    expect(descentRoute.distanceToGoNm as number).toBeLessThan(initialRoute.distanceToGoNm as number);
  });
});
