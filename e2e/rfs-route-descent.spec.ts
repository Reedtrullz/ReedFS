import { expect, test } from '@playwright/test';
import {
  advanceTakeoffThrustThroughVisibleControls,
  advanceVisibleSimTime,
  cleanUpAirframeThroughVisibleControls,
  clickVisibleMcpMode,
  driveVisibleSimUntil,
  loadSelectedRouteThroughVisibleControls,
  openRfsBlackbox,
  readVisibleFlightNumbers,
  readVisibleRouteStatus,
  rotateToVisiblePositiveRate,
  selectKseaScenarioThroughVisibleControls,
  setVisibleMcpAltitudeAtLeast,
  setVisibleMcpSpeedAtLeast,
  setVisibleMcpSpeedAtMost,
  setVisibleMcpVerticalSpeed,
  setVisibleSimRateTarget,
  startRollThroughVisibleControls,
  toggleVisibleGearThroughVisibleControls,
  waitForVisibleCoachText,
  waitForVisibleFlightPhase,
  waitForVisibleFmaModes,
} from './helpers/rfsBlackbox';

test.describe('RFS visible route descent proof', () => {
  test('visible descent workflow uses route progress and MCP controls without direct state seeding', async ({ page }, testInfo) => {
    test.setTimeout(480_000);
    const stages: unknown[] = [];
    const record = async (stage: string) => {
      const flight = await readVisibleFlightNumbers(page);
      console.info('Route proof stage', stage, JSON.stringify(flight));
      stages.push({ stage, wallUtc: new Date().toISOString(), flight,
        configuration: await page.getByRole('region', { name: 'Takeoff setup' }).getByLabel('Current takeoff configuration').textContent(),
        phase: await page.getByLabel('PFD flight phase', { exact: true }).textContent(),
        mcp: await page.getByRole('region', { name: 'Mode control panel' }).textContent(),
        route: await readVisibleRouteStatus(page), coach: await page.getByLabel('Coach status').textContent() });
    };
    try {

      await page.clock.install();
      await openRfsBlackbox(page);
      await setVisibleSimRateTarget(page, 4);
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

      // Keep rotation at pilot cadence; 650ms of held elevator at16X is
      // over ten simulator seconds and can produce a low-energy zoom.
      await setVisibleSimRateTarget(page, 1);
      await rotateToVisiblePositiveRate(page);
      expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);
      // Freeze the flight while the pilot configures targets; otherwise full
      // manual takeoff thrust accelerates through the knob-click sequence.
      const pause = page.getByRole('button', { name: /^PAUSE$/ });
      await expect(pause).toBeVisible();
      await pause.dispatchEvent('click');
      await expect(page.getByRole('button', { name: /^RESUME$/ })).toBeVisible();
      await toggleVisibleGearThroughVisibleControls(page, 'UP');
      await cleanUpAirframeThroughVisibleControls(page);
      await expect(currentConfig).toContainText('Gear UP');
      await record('positive-rate-cleanup');

      await loadSelectedRouteThroughVisibleControls(page);
      await expect(page.getByRole('status', { name: 'Route load result' })).toHaveText(
        'DEFAULT TRAINING ROUTE KSEA→KPDX loaded. Use the runway route panel for arbitrary supported runway pairs; synthetic approach fixes are not official procedure data; route guidance is active; use visible MCP LNAV, altitude, and VS/VNAV controls for climb/descent management.',
      );
      const initialRoute = await readVisibleRouteStatus(page);
      expect(initialRoute.distanceToGoNm).not.toBeNull();

      const climbTargetFt = await setVisibleMcpAltitudeAtLeast(page, 15_000);
      expect(climbTargetFt).toBeGreaterThanOrEqual(15_000);
      await setVisibleMcpSpeedAtLeast(page, 250);
      const speedTargetKt = await setVisibleMcpSpeedAtMost(page, 250);
      // Knob steps preserve the existing target's five-knot offset.
      expect(speedTargetKt).toBeGreaterThanOrEqual(245);
      expect(speedTargetKt).toBeLessThanOrEqual(250);
      const resume = page.getByRole('button', { name: /^RESUME$/ });
      await expect(resume).toBeVisible();
      await resume.dispatchEvent('click');
      await clickVisibleMcpMode(page, 'LNAV');
      await clickVisibleMcpMode(page, 'SPD');
      await clickVisibleMcpMode(page, 'ALT');
      await waitForVisibleFmaModes(page, {
        thrustActive: 'SPEED',
        lateralActive: 'LNAV',
        verticalActive: /^(ALT\*|ALT_HOLD)$/,
        autopilotStatus: 'CMD_A',
      });
      await record('autoflight-engaged');
      await setVisibleSimRateTarget(page, 16);
      // A per-leg distance decrease alone does not establish an airborne descent entry.
      await driveVisibleSimUntil(page, 'airborne climb above the KSEA descent-entry floor', async () => {
        const flight = await readVisibleFlightNumbers(page);
        if (flight.iasKt < 80 || flight.altitudeFt < 500) {
          await record('climb-energy-failure');
          throw new Error('Visible climb lost takeoff energy or returned near the ground.');
        }
        return flight.altitudeFt >= 2500 && flight.verticalSpeedFpm > 0;
      }, { timeoutMs: 120_000, stepMs: 1000 });
      expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);
      await record('airborne-route-climb');
      await expect(page.getByRole('button', { name: /Cycle simulator rate/ })).toHaveText('SIM RATE TARGET: 16X');

      await driveVisibleSimUntil(page, 'visible route progress toward KPDX and descent phase entry', async () => {
        const route = await readVisibleRouteStatus(page);
        if (route.distanceToGoNm === null || initialRoute.distanceToGoNm === null) return false;
        // DTG is per active leg; sequencing resets it to the next leg's length.
        const legAdvanced = (route.activeLegIndex ?? 0) > (initialRoute.activeLegIndex ?? 0);
        return legAdvanced || route.distanceToGoNm < initialRoute.distanceToGoNm - 0.5;
      }, { timeoutMs: 120_000, stepMs: 4000 });

      await clickVisibleMcpMode(page, 'VS');
      await setVisibleMcpVerticalSpeed(page, -900);
      await waitForVisibleFmaModes(page, {
        thrustActive: 'SPEED',
        lateralActive: 'LNAV',
        verticalActive: 'VS',
        autopilotStatus: 'CMD_A',
      });
      await expect(page.getByLabel('PFD MCP selected targets')).toContainText('SEL VS -900');
      await record('descent-selected');
      const descentEntry = await readVisibleFlightNumbers(page);
      await advanceVisibleSimTime(page, 1_000);
      await driveVisibleSimUntil(page, 'negative VS and a visible altitude decrease after descent selection', async () => {
        const flight = await readVisibleFlightNumbers(page);
        return flight.verticalSpeedFpm <= -100 && flight.altitudeFt <= descentEntry.altitudeFt - 20;
      }, { timeoutMs: 300_000, stepMs: 4000 });

      const descentCoach = await waitForVisibleCoachText(page, /^Descent:/i);
      expect(descentCoach).toMatch(/route descent path/i);
      expect(await waitForVisibleFlightPhase(page, /^(DESCENT|APPROACH)$/)).toMatch(/^(DESCENT|APPROACH)$/);
      await expect(page.getByRole('region', { name: 'Scenario and tutorial' }).getByText('Descent established')).toBeVisible();

      const descentRoute = await readVisibleRouteStatus(page);
      expect(descentRoute.distanceToGoNm).not.toBeNull();
      // Per-leg DTG resets at sequencing boundaries; require leg progress or a same-leg drop.
      const madeLegProgress = (descentRoute.activeLegIndex ?? 0) > (initialRoute.activeLegIndex ?? 0);
      if (madeLegProgress) {
        expect(descentRoute.activeLegIndex as number).toBeGreaterThan(initialRoute.activeLegIndex as number);
      } else {
        expect(descentRoute.distanceToGoNm as number).toBeLessThan(initialRoute.distanceToGoNm as number);
      }
      await record('descent-established');
    } finally {
      try { if (!page.isClosed()) await record('final-observation'); }
      catch (error) { stages.push({ stage: 'final-observation-unavailable', error: String(error) }); }
      await testInfo.attach('native-visible-route-descent', { body: JSON.stringify({ scope: 'Visible controls and readouts; KSEA pilot-cadence takeoff,4X climb and16X route/actual negative-VS descent with at least20ft altitude decrease, unchanged480s cap, no direct state seeding or full-flight qualification', stages }, null, 2), contentType: 'application/json' });
    }
  });
});
