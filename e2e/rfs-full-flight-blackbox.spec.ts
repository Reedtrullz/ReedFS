import { expect, test } from '@playwright/test';
import {
  advanceTakeoffThrustThroughVisibleControls,
  cleanUpAirframeThroughVisibleControls,
  clickVisibleAppModeWhenAvailable,
  clickVisibleMcpMode,
  configureLandingAirframeThroughVisibleControls,
  configureScenarioTakeoffThroughVisibleControls,
  driveVisibleSimUntil,
  holdVisibleBrakeUntilStopped,
  idleThrustThroughVisibleControls,
  loadSelectedRouteThroughVisibleControls,
  openRfsBlackbox,
  readVisibleAutolandFmaModes,
  readVisibleFlightNumbers,
  readVisibleFlightPhase,
  readVisibleFmaModes,
  readVisibleRouteStatus,
  resetThroughVisibleControls,
  rotateToVisiblePositiveRate,
  selectEnvaScenarioThroughVisibleControls,
  setVisibleMcpAltitudeAtMost,
  setVisibleMcpSpeedAtMost,
  setVisibleMcpVerticalSpeed,
  setVisibleSimRateTarget,
  startRollThroughVisibleControls,
  toggleVisibleGearThroughVisibleControls,
  useRealTimeVisibleSim,
  waitForVisibleFlightPhase,
  waitForVisibleFmaModes,
  type VisibleRouteLoadExpectation,
} from './helpers/rfsBlackbox';

const ENVA_ENGM_ROUTE: VisibleRouteLoadExpectation = {
  routeName: 'ENVA→ENGM',
  activeLegCount: 4,
  firstLeg: 'ENVA → RFSNOR',
};

test.describe('RFS full flight black-box acceptance', () => {
  test.describe.configure({ retries: 0 });

  test('continuous ENVA to ENGM route/autoland proof reaches STOPPED before reset', async ({ page }) => {
    test.setTimeout(900_000);

    await page.clock.install();
    await openRfsBlackbox(page);
    await setVisibleSimRateTarget(page, 16);

    await selectEnvaScenarioThroughVisibleControls(page);
    await expect(page.getByLabel('Route status')).toContainText('NO ROUTE');
    await loadSelectedRouteThroughVisibleControls(page, ENVA_ENGM_ROUTE);
    await expect(page.getByRole('status', { name: 'Route load result' })).toContainText(/ENVA→ENGM loaded/);

    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    const currentConfig = takeoffSetup.getByLabel('Current takeoff configuration');
    await configureScenarioTakeoffThroughVisibleControls(page);
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);
    await expect(currentConfig).toContainText(/Throttle\s+0%/);
    await expect(currentConfig).toContainText(/Gear\s+DOWN/);

    const loadedRoute = await readVisibleRouteStatus(page);
    expect(loadedRoute.text).toMatch(/ENVA→ENGM/);
    expect(loadedRoute.activeLegIndex).toBe(1);
    expect(loadedRoute.activeLegCount).toBe(ENVA_ENGM_ROUTE.activeLegCount);
    expect(loadedRoute.activeLeg).toBe(ENVA_ENGM_ROUTE.firstLeg);
    expect(loadedRoute.distanceToGoNm).not.toBeNull();

    await startRollThroughVisibleControls(page);
    await advanceTakeoffThrustThroughVisibleControls(page);
    await driveVisibleSimUntil(page, 'visible ENVA takeoff speed for deliberate rotation', async () => {
      return (await readVisibleFlightNumbers(page)).iasKt >= 145;
    }, {
      timeoutMs: 120_000,
      stepMs: 1000,
    });
    await rotateToVisiblePositiveRate(page);
    expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);

    await toggleVisibleGearThroughVisibleControls(page, 'UP');
    await expect(currentConfig).toContainText(/Gear\s+UP/);
    await cleanUpAirframeThroughVisibleControls(page);
    await expect(currentConfig).toContainText(/Flaps\s+0/);

    await clickVisibleMcpMode(page, 'LNAV');
    await clickVisibleMcpMode(page, 'SPD');
    await clickVisibleMcpMode(page, 'VS');
    await setVisibleMcpVerticalSpeed(page, 800);
    await waitForVisibleFmaModes(page, {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: 'VS',
      autopilotStatus: 'CMD_A',
    });
    await expect(page.getByRole('status', { name: 'Autopilot authority warning' })).toHaveCount(0);
    await page.clock.resume();
    useRealTimeVisibleSim(page);
    await setVisibleSimRateTarget(page, 64);

    await driveVisibleSimUntil(page, 'visible ENVA to ENGM route progress to enroute descent leg', async () => {
      const route = await readVisibleRouteStatus(page);
      if (route.distanceToGoNm === null || loadedRoute.distanceToGoNm === null) return false;
      return (route.activeLegIndex ?? 1) >= 2;
    }, {
      timeoutMs: 360_000,
      stepMs: 250,
    });
    await setVisibleSimRateTarget(page, 16);

    const descentTargetFt = await setVisibleMcpAltitudeAtMost(page, 3_000);
    expect(descentTargetFt).toBeLessThanOrEqual(3_000);
    const descentSpeedKt = await setVisibleMcpSpeedAtMost(page, 190);
    expect(descentSpeedKt).toBeLessThanOrEqual(190);
    await setVisibleMcpVerticalSpeed(page, -900);
    await waitForVisibleFmaModes(page, {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: 'VS',
      autopilotStatus: 'CMD_A',
    });
    expect(await waitForVisibleFlightPhase(page, /^(DESCENT|APPROACH)$/)).toMatch(/^(DESCENT|APPROACH)$/);

    await setVisibleSimRateTarget(page, 1);
    await configureLandingAirframeThroughVisibleControls(page, 30);
    await expect(currentConfig).toContainText(/Gear\s+DOWN/);
    await expect(currentConfig).toContainText(/Flaps\s+30/);

    let appClicked = false;
    await driveVisibleSimUntil(page, 'visible MCP APP mode availability', async () => {
      appClicked = appClicked || await clickVisibleAppModeWhenAvailable(page);
      return appClicked;
    }, {
      timeoutMs: 60_000,
      stepMs: 250,
    });
    expect(appClicked).toBe(true);

    await driveVisibleSimUntil(page, 'visible autoland APP G_S CMD_AB FMA capture', async () => {
      const autolandFma = await readVisibleAutolandFmaModes(page);
      return autolandFma.appActive
        && autolandFma.glideSlopeActive
      && autolandFma.dualChannelAutopilotActive;
    }, {
      timeoutMs: 180_000,
      stepMs: 500,
    });
    const capturedAutolandFma = await readVisibleAutolandFmaModes(page);
    expect(capturedAutolandFma.raw).toEqual({
      thrustActive: 'SPEED',
      lateralActive: 'APP',
      verticalActive: 'G_S',
      autopilotStatus: 'CMD_AB',
    });

    await setVisibleSimRateTarget(page, 16);

    await driveVisibleSimUntil(page, 'visible ENGM synthetic approach handoff', async () => {
      const route = await readVisibleRouteStatus(page);
      return (route.activeLegIndex ?? 1) >= 3
        || /Approach handoff/i.test(route.text)
        || /ENGM19R_(?:IF|FAF)\s+→\s+ENGM19R_(?:FAF|RWY)/.test(route.activeLeg ?? '');
    }, {
      timeoutMs: 360_000,
      stepMs: 100,
    });

    let sawRetard = false;
    await driveVisibleSimUntil(page, 'visible autoland RETARD readback', async () => {
      const autolandFma = await readVisibleAutolandFmaModes(page);
      sawRetard = sawRetard || autolandFma.retardActive;
      return sawRetard;
    }, {
      timeoutMs: 300_000,
      stepMs: 500,
    });
    expect(sawRetard).toBe(true);

    await driveVisibleSimUntil(page, 'visible landing rollout lifecycle', async () => {
      const phase = await readVisibleFlightPhase(page);
      return /^(TOUCHDOWN|DEROTATION|ROLLOUT|TAXI|STOPPED)$/.test(phase);
    }, {
      timeoutMs: 120_000,
      stepMs: 500,
    });

    await idleThrustThroughVisibleControls(page);
    await expect(currentConfig).toContainText(/Throttle\s+0%/);
    await holdVisibleBrakeUntilStopped(page);
    expect(await readVisibleFlightPhase(page)).toBe('STOPPED');
    await expect(page.getByLabel('Coach status')).toContainText(/reset/i);

    // Final reset section: continuous ENVA-to-ENGM proof already reached STOPPED.
    await resetThroughVisibleControls(page);
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();
    await expect(page.getByLabel('Route status')).toContainText('NO ROUTE');
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);
    await expect(currentConfig).toContainText(/Throttle\s+0%/);
    await expect(currentConfig).toContainText(/Gear\s+DOWN/);
    expect(await readVisibleFlightPhase(page)).toBe('PARKED');
    expect(await readVisibleFmaModes(page)).toEqual({
      thrustActive: 'OFF',
      lateralActive: 'OFF',
      verticalActive: 'OFF',
      autopilotStatus: 'OFF',
    });
  });
});
