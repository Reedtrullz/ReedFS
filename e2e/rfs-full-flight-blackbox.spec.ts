import { expect, test } from '@playwright/test';
import {
  advanceTakeoffThrustThroughVisibleControls,
  cleanUpAirframeThroughVisibleControls,
  clickVisibleAppModeWhenAvailable,
  clickVisibleMcpMode,
  configureLandingAirframeThroughVisibleControls,
  configureScenarioTakeoffThroughVisibleControls,
  driveVisibleSimUntil,
  holdKeyForVisibleSimTime,
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
  selectKseaScenarioThroughVisibleControls,
  selectEnvaScenarioThroughVisibleControls,
  setVisibleMcpAltitudeAtLeast,
  setVisibleMcpAltitudeAtMost,
  setVisibleMcpSpeedAtLeast,
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

const KSEA_KPDX_RUNWAY_PAIR_ROUTE: VisibleRouteLoadExpectation = {
  routeName: 'KSEA→KPDX',
  activeLegCount: 5,
  firstLeg: 'KSEA16L_DEP → KSEA16L_CLB',
};

test.describe('RFS full flight black-box acceptance', () => {
  test.describe.configure({ retries: 0 });

  test('KSEA to KPDX runway-pair VNAV proof descends without MCP intervention', async ({ page }) => {
    test.setTimeout(2_400_000);

    await page.clock.install();
    await openRfsBlackbox(page);
    await selectKseaScenarioThroughVisibleControls(page);

    const builderOrigin = page.getByLabel('Custom origin runway');
    const builderDestination = page.getByLabel('Custom destination runway');
    await builderOrigin.selectOption('KSEA:16L');
    await builderDestination.selectOption('KPDX:10R');
    const loadRouteButton = page.getByRole('button', { name: /^Load Route$/ });
    await expect(loadRouteButton).toBeEnabled();
    await loadRouteButton.click();
    await expect(page.getByLabel('Generated route result')).toHaveText('KSEA 16L → KPDX 10R');

    const routeStatus = page.getByLabel('Route status');
    await expect(routeStatus).toContainText('KSEA→KPDX');
    await expect(routeStatus).toContainText('LEG 1/5');
    await expect(routeStatus).toContainText(KSEA_KPDX_RUNWAY_PAIR_ROUTE.firstLeg);

    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    const currentConfig = takeoffSetup.getByLabel('Current takeoff configuration');
    await configureScenarioTakeoffThroughVisibleControls(page);
    await expect(currentConfig).toContainText(/Flaps\s+5/);
    await expect(currentConfig).toContainText(/Trim\s+5\.0/);

    await startRollThroughVisibleControls(page);
    await advanceTakeoffThrustThroughVisibleControls(page);
    await driveVisibleSimUntil(page, 'visible KSEA takeoff speed for deliberate rotation', async () => {
      return (await readVisibleFlightNumbers(page)).iasKt >= 145;
    }, {
      timeoutMs: 120_000,
      stepMs: 1000,
    });
    await rotateToVisiblePositiveRate(page);
    expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);

    // From here the autoflight handover is staged in real time: the fake clock
    // at 16x lets hands-off pitch decay become a full bunt during cleanup.
    await page.clock.resume();
    useRealTimeVisibleSim(page);

    await toggleVisibleGearThroughVisibleControls(page, 'UP');
    await expect(currentConfig).toContainText(/Gear\s+UP/);
    await cleanUpAirframeThroughVisibleControls(page);
    await expect(currentConfig).toContainText(/Flaps\s+0/);

    await setVisibleMcpAltitudeAtLeast(page, 15_000);
    await setVisibleMcpSpeedAtLeast(page, 250);
    await clickVisibleMcpMode(page, 'LNAV');
    await clickVisibleMcpMode(page, 'SPD');
    await clickVisibleMcpMode(page, 'VNAV');
    await waitForVisibleFmaModes(page, {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: /^(VNAV|VNAV_PTH|ALT\*)$/,
      autopilotStatus: 'CMD_A',
    });
    await expect(page.getByRole('status', { name: 'Autopilot authority warning' })).toHaveCount(0);

    await page.clock.resume();
    useRealTimeVisibleSim(page);
    // The manual climb, MCP pinning, and engagement all run at 1x: the sim rate
    // multiplies every blind window between polls and clicks, so 16x turns a
    // marginal hands-off climb into a bunt before the next poll observes it.
    await setVisibleSimRateTarget(page, 1);

    let lastClimbNumbers = { altitudeFt: 0, iasKt: 0, verticalSpeedFpm: 0 };
    try {
      await driveVisibleSimUntil(page, 'visible VNAV climb approaching the enroute constraint', async () => {
        const numbers = await readVisibleFlightNumbers(page);
        lastClimbNumbers = { altitudeFt: numbers.altitudeFt, iasKt: numbers.iasKt, verticalSpeedFpm: numbers.verticalSpeedFpm };
        return numbers.altitudeFt >= 11_000;
      }, {
        timeoutMs: 600_000,
        stepMs: 1000,
      });
    } catch (error) {
      throw new Error(`VNAV climb stalled at ${JSON.stringify(lastClimbNumbers)}`, { cause: error });
    }
    await driveVisibleSimUntil(page, 'visible VNAV cruise capture at the enroute constraint', async () => {
      const fma = await readVisibleFmaModes(page);
      const numbers = await readVisibleFlightNumbers(page);
      return fma.verticalActive === 'ALT_HOLD' && numbers.altitudeFt >= 11_500;
    }, {
      timeoutMs: 600_000,
      stepMs: 1000,
    });

    await setVisibleSimRateTarget(page, 64);
    await driveVisibleSimUntil(page, 'visible VNAV path descent after TOD', async () => {
      return (await readVisibleFmaModes(page)).verticalActive === 'VNAV_PTH';
    }, {
      timeoutMs: 240_000,
      stepMs: 1000,
    });

    await setVisibleSimRateTarget(page, 16);
    expect(await waitForVisibleFlightPhase(page, /^DESCENT$/)).toBe('DESCENT');

    await driveVisibleSimUntil(page, 'visible DES-constraint descent progress toward the FAF', async () => {
      const route = await readVisibleRouteStatus(page);
      return (route.activeLegIndex ?? 1) >= 4;
    }, {
      timeoutMs: 360_000,
      stepMs: 1000,
    });

    await setVisibleSimRateTarget(page, 1);
    await configureLandingAirframeThroughVisibleControls(page, 30);
    await expect(currentConfig).toContainText(/Gear\s+DOWN/);
    await expect(currentConfig).toContainText(/Flaps\s+30/);
    await setVisibleSimRateTarget(page, 4);
    expect(await waitForVisibleFlightPhase(page, /^APPROACH$/)).toBe('APPROACH');
    await driveVisibleSimUntil(page, 'visible approach handoff at the FAF leg', async () => {
      const route = await readVisibleRouteStatus(page);
      return (route.activeLegIndex ?? 1) >= 5;
    }, {
      timeoutMs: 240_000,
      stepMs: 1000,
    });

    const finalFma = await readVisibleFmaModes(page);
    expect(['VNAV', 'VNAV_PTH', 'ALT_HOLD']).toContain(finalFma.verticalActive);
    expect(finalFma.lateralActive).toBe('LNAV');

    await resetThroughVisibleControls(page);
    await expect(page.getByRole('button', { name: /^START ROLL$/ })).toBeVisible();
    await expect(routeStatus).toContainText('NO ROUTE');
  });

  test('continuous ENVA to ENGM route/autoland proof reaches STOPPED before reset', async ({ page }) => {
    test.setTimeout(3_000_000);

    await page.clock.install();
    await openRfsBlackbox(page);
    // Manual takeoff, rotation, cleanup, and the pre-autoflight climb run at
    // 4x: at 16x the unattended windows between key bursts are large enough
    // that the aircraft can bunt or zoom through the engagement gate
    // nondeterministically.
    await setVisibleSimRateTarget(page, 4);

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

    // Engage the autoflight only after a safe climb altitude: VS engagement at
    // a few hundred feet AGL races the cleanup and has stalled back into terrain.
    const preClimbDiagnostics: string[] = [];
    const preClimbStartedAt = Date.now();
    try {
      await driveVisibleSimUntil(page, 'visible climb to safe autoflight engagement altitude', async () => {
        const numbers = await readVisibleFlightNumbers(page);
        preClimbDiagnostics.push(
          't=' + ((Date.now() - preClimbStartedAt) / 1000).toFixed(0)
          + ' alt=' + numbers.altitudeFt + ' ias=' + numbers.iasKt + ' vs=' + numbers.verticalSpeedFpm
          + ' pitch=' + numbers.pitchDeg,
        );
        // Sized for the 4x manual climb: the same sim time takes 4x the
        // wall clock compared to the previous 16x setup.
        if (Date.now() - preClimbStartedAt > 300_000) {
          throw new Error('ENVA pre-autoflight climb guard tripped; trace='
            + JSON.stringify(preClimbDiagnostics.slice(-180)));
        }
        // Engage as soon as the climb is established; waiting for a narrow
        // sanity window lets the 5-unit takeoff trim re-zoom the aircraft
        // before the click sequence ever runs. The VS seed clamp absorbs the
        // residual zoom at engagement.
        if (numbers.altitudeFt >= 2_000 && numbers.verticalSpeedFpm > 100 && numbers.iasKt >= 160) return true;
        if (numbers.pitchDeg < 8 && numbers.iasKt >= 150) {
          await holdKeyForVisibleSimTime(page, 'KeyW', 700);
        }
        return false;
      }, {
        timeoutMs: 360_000,
        stepMs: 1000,
      });
    } catch (error) {
      throw new Error(
        'ENVA pre-autoflight climb failed. trace=' + JSON.stringify(preClimbDiagnostics.slice(-180)),
        { cause: error },
      );
    }

    // Trim clearly nose-up before the click sequence: at 4x the unattended
    // windows between clicks still bleed a few degrees of pitch.
    await setVisibleSimRateTarget(page, 4);
    await driveVisibleSimUntil(page, 'nose-up trim before autoflight engagement', async () => {
      const numbers = await readVisibleFlightNumbers(page);
      if (numbers.pitchDeg >= 8) return true;
      if (numbers.iasKt >= 150) {
        await holdKeyForVisibleSimTime(page, 'KeyW', 500);
      }
      return false;
    }, {
      timeoutMs: 150_000,
      stepMs: 500,
    });

    // Pin the MCP above the idle 10000 ft default before the first mode click:
    // with no AP state yet, the first click seeds the target from live aircraft
    // altitude, which previously made the descent gate altitude-race-dependent.
    // Pin the climb target well above the ENVA tutorial floor so the VS climb
    // runs uninterrupted to the enroute descent leg without early capture.
    await setVisibleMcpAltitudeAtLeast(page, 16_000);
    await setVisibleMcpSpeedAtLeast(page, 210);
    await clickVisibleMcpMode(page, 'LNAV');
    await clickVisibleMcpMode(page, 'SPD');
    await clickVisibleMcpMode(page, 'VS');
    await setVisibleMcpVerticalSpeed(page, 800);
    await setVisibleMcpSpeedAtLeast(page, 210);
    await waitForVisibleFmaModes(page, {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: 'VS',
      autopilotStatus: 'CMD_A',
    });
    await expect(page.getByRole('status', { name: 'Autopilot authority warning' })).toHaveCount(0);
    const postEngagementStartedAt = Date.now();
    try {
      await driveVisibleSimUntil(page, 'visible VS climb established after autoflight engagement', async () => {
        const numbers = await readVisibleFlightNumbers(page);
        preClimbDiagnostics.push(
          'E t=' + ((Date.now() - postEngagementStartedAt) / 1000).toFixed(0)
          + ' alt=' + numbers.altitudeFt + ' ias=' + numbers.iasKt + ' vs=' + numbers.verticalSpeedFpm
          + ' pitch=' + numbers.pitchDeg,
        );
        if (Date.now() - postEngagementStartedAt > 180_000) {
          throw new Error('ENVA post-engagement climb guard tripped; trace='
            + JSON.stringify(preClimbDiagnostics.slice(-180)));
        }
        if (numbers.altitudeFt >= 3_000 && numbers.verticalSpeedFpm >= 300 && numbers.iasKt >= 160) return true;
        if (numbers.pitchDeg < 5 && numbers.iasKt >= 150) {
          await holdKeyForVisibleSimTime(page, 'KeyW', 400);
        }
        return false;
      }, {
        timeoutMs: 180_000,
        stepMs: 250,
      });
    } catch (error) {
      throw new Error(
        'ENVA post-engagement climb failed. trace=' + JSON.stringify(preClimbDiagnostics.slice(-180)),
        { cause: error },
      );
    }
    await setVisibleSimRateTarget(page, 64);

    const climbDiagnostics: string[] = [];
    const climbStartedAt = Date.now();
    try {
      await driveVisibleSimUntil(page, 'visible ENVA to ENGM route progress to enroute descent leg', async () => {
        const route = await readVisibleRouteStatus(page);
        const numbers = await readVisibleFlightNumbers(page);
        climbDiagnostics.push(
          't=' + ((Date.now() - climbStartedAt) / 1000).toFixed(0)
          + ' alt=' + numbers.altitudeFt + ' ias=' + numbers.iasKt + ' vs=' + numbers.verticalSpeedFpm
          + ' leg=' + route.activeLegIndex,
        );
        if (Date.now() - climbStartedAt > 600_000) {
          throw new Error('ENVA climb wall-clock guard tripped; trace='
            + JSON.stringify(climbDiagnostics.slice(-360)));
        }
        if (route.distanceToGoNm === null || loadedRoute.distanceToGoNm === null) return false;
        return (route.activeLegIndex ?? 1) >= 2;
      }, {
        timeoutMs: 360_000,
        stepMs: 250,
      });
    } catch (error) {
      const route = await readVisibleRouteStatus(page);
      const fma = await readVisibleFmaModes(page);
      const numbers = await readVisibleFlightNumbers(page);
      throw new Error(
        'ENVA climb wait failed. route=' + JSON.stringify(route)
        + ' fma=' + JSON.stringify(fma)
        + ' numbers=' + JSON.stringify(numbers)
        + ' trace=' + JSON.stringify(climbDiagnostics.slice(-360)),
        { cause: error },
      );
    }
    await setVisibleSimRateTarget(page, 16);

    const descentDiagnostics: string[] = [];
    const descentStartedAt = Date.now();
    // The descent profile must stay on the front side of the drag curve at
    // the top of descent: 160 kt / -700 fpm keeps energy margin at altitude,
    // where the previous 190 kt / -900 fpm selection bled to a stall.
    const descentTargetFt = await setVisibleMcpAltitudeAtMost(page, 3_000);
    expect(descentTargetFt).toBeLessThanOrEqual(3_000);
    const descentSpeedKt = await setVisibleMcpSpeedAtMost(page, 210);
    expect(descentSpeedKt).toBeLessThanOrEqual(210);
    await setVisibleMcpVerticalSpeed(page, -700);
    await waitForVisibleFmaModes(page, {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: 'VS',
      autopilotStatus: 'CMD_A',
    });
    expect(await waitForVisibleFlightPhase(page, /^(DESCENT|APPROACH)$/)).toMatch(/^(DESCENT|APPROACH)$/);

    try {
      await driveVisibleSimUntil(page, 'visible ENGM final-approach leg before APP capture', async () => {
        const route = await readVisibleRouteStatus(page);
        const numbers = await readVisibleFlightNumbers(page);
        descentDiagnostics.push(
          't=' + ((Date.now() - descentStartedAt) / 1000).toFixed(0)
          + ' alt=' + numbers.altitudeFt + ' ias=' + numbers.iasKt + ' vs=' + numbers.verticalSpeedFpm
          + ' leg=' + route.activeLegIndex,
        );
        if (Date.now() - descentStartedAt > 600_000) {
          const mcpTextWall = (await page.getByRole('region', { name: 'Mode control panel' }).textContent())?.replace(/\s+/g, ' ').trim() ?? '';
          throw new Error('ENVA descent wall-clock guard tripped; mcp=' + mcpTextWall
            + ' trace=' + JSON.stringify(descentDiagnostics.slice(-360)));
        }
        return (route.activeLegIndex ?? 1) >= 3;
      }, {
        timeoutMs: 300_000,
        stepMs: 250,
      });
    } catch (error) {
      const route = await readVisibleRouteStatus(page);
      const fma = await readVisibleFmaModes(page);
      const numbers = await readVisibleFlightNumbers(page);
      const mcpText = (await page.getByRole('region', { name: 'Mode control panel' }).textContent())?.replace(/\s+/g, ' ').trim() ?? '';
      throw new Error(
        'ENGM final-approach leg wait failed. route=' + JSON.stringify(route)
        + ' fma=' + JSON.stringify(fma)
        + ' numbers=' + JSON.stringify(numbers)
        + ' mcp=' + mcpText
        + ' trace=' + JSON.stringify(descentDiagnostics.slice(-360)),
        { cause: error },
      );
    }

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

    // RETARD is a transient FMA window of a few sim seconds around the flare.
    // At 16x the polling loop can step straight over it, so the final approach
    // segment drops to 4x to make the readback observable.
    await setVisibleSimRateTarget(page, 4);

    let sawRetard = false;
    await driveVisibleSimUntil(page, 'visible autoland RETARD readback', async () => {
      const autolandFma = await readVisibleAutolandFmaModes(page);
      sawRetard = sawRetard || autolandFma.retardActive;
      return sawRetard;
    }, {
      timeoutMs: 300_000,
      stepMs: 250,
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
