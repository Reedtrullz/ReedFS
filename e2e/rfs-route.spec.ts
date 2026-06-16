import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';
import {
  flyKseaFinalRouteExtendedDescentToKpdxLandingAndReset,
  flyKseaFinalRouteHandoffToKpdxLandingAndReset,
  flyKseaFinalRouteApproachManualHandoffAndReset,
  flyKseaFinalRouteApproachToManualHandoff,
  flyKseaFinalRouteToConfiguredApproach,
  flyKseaRouteThroughFirstSequence,
  flyKseaRouteThroughMultiGateProgression,
  flyKseaRouteThroughSecondSequence,
  flyKseaRouteWithLnav,
  loadKseaRouteAndVerifyStoppedAutomationGatingThroughUi,
} from './helpers/rfsRoute';

const EXPECTED_LANDING_PHASES = ['TOUCHDOWN', 'DEROTATION', 'ROLLOUT', 'STOPPED'];
const ROLLOUT_GUIDANCE_PHASES = ['landing-rollout', 'taxi', 'stopped'];

function expectExplicitLandingSequence(phases: string[], routeDebug: string): void {
  expect(phases, routeDebug).toEqual(expect.arrayContaining(EXPECTED_LANDING_PHASES));
  expect(phases, routeDebug).not.toContain('LANDED');
  expect(phases.indexOf('TOUCHDOWN'), routeDebug).toBeLessThan(phases.indexOf('DEROTATION'));
  expect(phases.indexOf('DEROTATION'), routeDebug).toBeLessThan(phases.indexOf('ROLLOUT'));
  expect(phases.indexOf('ROLLOUT'), routeDebug).toBeLessThan(phases.indexOf('STOPPED'));
}

test.describe('RFS route and LNAV browser proof', () => {
  test('KSEA route is loaded and stopped AP mode clicks remain gated through visible controls', async ({ page }) => {
    await openRfs(page);

    await loadKseaRouteAndVerifyStoppedAutomationGatingThroughUi(page);
  });

  test('KSEA sample route loads, enables LNAV, and decreases DTG while flying', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaRouteWithLnav(page);
    const routeDebug = JSON.stringify(result.samples, null, 2);

    expect(result.initial.routeName).toBe('KSEA→KPDX');
    expect(result.initial.lnavAvailable).toBe(true);
    expect(result.initial.lateralActive).toBe('LNAV');
    expect(result.initial.fmaLateralActive).toBe('LNAV');
    expect(result.final.routeName).toBe('KSEA→KPDX');
    expect(result.final.lnavAvailable).toBe(true);
    for (const sample of result.samples) {
      expect(sample.lnavAvailable, routeDebug).toBe(true);
      expect(sample.fmaLateralActive, routeDebug).toBe('LNAV');
    }
    expect(result.final.distanceToNextNm, routeDebug).toBeLessThan(result.initial.distanceToNextNm - 0.2);
    expect(result.final.activeLegIndex, routeDebug).toBeGreaterThanOrEqual(result.initial.activeLegIndex);
    for (let i = 1; i < result.samples.length; i += 1) {
      expect(result.samples[i].activeLegIndex, routeDebug).toBeGreaterThanOrEqual(result.samples[i - 1].activeLegIndex);
    }
    expect(result.samples.length).toBeGreaterThan(3);
  });

  test('KSEA sample route sequences from OLM to BTG while LNAV remains backed', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaRouteThroughFirstSequence(page);
    const routeDebug = JSON.stringify(result.samples, null, 2);
    const legTransitioned = result.samples.some((sample, index) => {
      return index > 0 && result.samples[index - 1].activeLegIndex === 0 && sample.activeLegIndex === 1;
    });
    const sequenced = result.samples.some((sample) => sample.sequenced);

    expect(result.initial.routeName).toBe('KSEA→KPDX');
    expect(result.initial.activeLegIndex).toBe(0);
    expect(result.final.activeLegIndex, routeDebug).toBe(1);
    expect(result.final.fromIdent, routeDebug).toBe('OLM');
    expect(result.final.nextWaypointIdent, routeDebug).toBe('BTG');
    for (const sample of result.samples) {
      expect(sample.lnavAvailable, routeDebug).toBe(true);
      expect(sample.fmaLateralActive, routeDebug).toBe('LNAV');
    }
    expect(legTransitioned || sequenced, routeDebug).toBe(true);
  });

  test('KSEA sample route sequences from BTG to the KPDX 10R initial approach fix while LNAV remains backed', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaRouteThroughSecondSequence(page);
    const routeDebug = JSON.stringify(result.samples, null, 2);
    const legTransitioned = result.samples.some((sample, index) => {
      return index > 0 && result.samples[index - 1].activeLegIndex === 1 && sample.activeLegIndex === 2;
    });
    const sequenced = result.samples.some((sample) => sample.sequenced);

    expect(result.initial.routeName).toBe('KSEA→KPDX');
    expect(result.initial.activeLegIndex).toBe(1);
    expect(result.initial.fromIdent, routeDebug).toBe('OLM');
    expect(result.initial.nextWaypointIdent, routeDebug).toBe('BTG');
    expect(result.final.activeLegIndex, routeDebug).toBe(2);
    expect(result.final.fromIdent, routeDebug).toBe('BTG');
    expect(result.final.nextWaypointIdent, routeDebug).toBe('KPDX10R_IF');
    for (const sample of result.samples) {
      expect(sample.lnavAvailable, routeDebug).toBe(true);
      expect(sample.fmaLateralActive, routeDebug).toBe('LNAV');
    }
    expect(legTransitioned || sequenced, routeDebug).toBe(true);
  });

  test('KSEA sample route progresses through OLM and BTG gates in one store session while LNAV remains backed', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaRouteThroughMultiGateProgression(page);
    const routeDebug = JSON.stringify(result.samples, null, 2);
    const firstTransitioned = result.samples.some((sample, index) => {
      return index > 0 && result.samples[index - 1].activeLegIndex === 0 && sample.activeLegIndex === 1;
    });
    const secondTransitioned = result.samples.some((sample, index) => {
      return index > 0 && result.samples[index - 1].activeLegIndex === 1 && sample.activeLegIndex === 2;
    });

    expect(result.initial.routeName).toBe('KSEA→KPDX');
    expect(result.initial.activeLegIndex).toBe(0);
    expect(result.final.activeLegIndex, routeDebug).toBe(2);
    expect(result.final.fromIdent, routeDebug).toBe('BTG');
    expect(result.final.nextWaypointIdent, routeDebug).toBe('KPDX10R_IF');
    for (const sample of result.samples) {
      expect(sample.lnavAvailable, routeDebug).toBe(true);
      expect(sample.fmaLateralActive, routeDebug).toBe('LNAV');
    }
    for (let i = 1; i < result.samples.length; i += 1) {
      expect(result.samples[i].activeLegIndex, routeDebug).toBeGreaterThanOrEqual(result.samples[i - 1].activeLegIndex);
    }
    expect(firstTransitioned, routeDebug).toBe(true);
    expect(secondTransitioned, routeDebug).toBe(true);
  });

  test('KSEA final route leg configures approach while LNAV remains coupled and vertical FMA stays off', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaFinalRouteToConfiguredApproach(page);
    const routeDebug = JSON.stringify(result.samples, null, 2);

    expect(result.initial.routeName).toBe('KSEA→KPDX');
    expect(result.initial.activeLegIndex).toBe(4);
    expect(result.initial.fromIdent, routeDebug).toBe('KPDX10R_FAF');
    expect(result.initial.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    expect(result.initial.lnavAvailable, routeDebug).toBe(true);
    expect(result.initial.lateralActive, routeDebug).toBe('LNAV');
    expect(result.initial.fmaLateralActive, routeDebug).toBe('LNAV');
    expect(result.initial.autopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.initial.fmaAutopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.initial.thrustActive, routeDebug).toBe('SPEED');
    expect(result.initial.fmaThrustActive, routeDebug).toBe('SPEED');
    expect(result.initial.verticalActive, routeDebug).toBe('OFF');
    expect(result.initial.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.initial.flightPhase, routeDebug).toBe('DESCENT');
    expect(result.initial.weightOnWheels, routeDebug).toBe(false);
    expect(result.initial.gearDown, routeDebug).toBe(false);
    expect(result.initial.flapSetting, routeDebug).toBeLessThan(25);

    expect(result.configuredApproach.routeName).toBe('KSEA→KPDX');
    expect(result.configuredApproach.activeLegIndex, routeDebug).toBe(4);
    expect(result.configuredApproach.fromIdent, routeDebug).toBe('KPDX10R_FAF');
    expect(result.configuredApproach.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    expect(result.configuredApproach.lnavAvailable, routeDebug).toBe(true);
    expect(result.configuredApproach.lateralActive, routeDebug).toBe('LNAV');
    expect(result.configuredApproach.fmaLateralActive, routeDebug).toBe('LNAV');
    expect(result.configuredApproach.autopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.configuredApproach.fmaAutopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.configuredApproach.thrustActive, routeDebug).toBe('SPEED');
    expect(result.configuredApproach.fmaThrustActive, routeDebug).toBe('SPEED');
    expect(result.configuredApproach.verticalActive, routeDebug).toBe('OFF');
    expect(result.configuredApproach.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.configuredApproach.distanceToNextNm, routeDebug).toBeLessThan(result.initial.distanceToNextNm - 0.5);
    expect(result.configuredApproach.altitudeFt, routeDebug).toBeLessThan(result.initial.altitudeFt - 100);
    expect(result.configuredApproach.aglFt, routeDebug).toBeLessThan(result.initial.aglFt - 100);
    expect(result.configuredApproach.gearDown, routeDebug).toBe(true);
    expect(result.configuredApproach.gearLever, routeDebug).toBe('DOWN');
    expect(result.configuredApproach.flapSetting, routeDebug).toBeGreaterThanOrEqual(25);
    expect(result.configuredApproach.weightOnWheels, routeDebug).toBe(false);
    expect(result.configuredApproach.guidancePhase, routeDebug).toBe('approach');

    expect(result.samples.length).toBeGreaterThan(3);
    for (const sample of result.samples) {
      expect(sample.routeName, routeDebug).toBe('KSEA→KPDX');
      expect(sample.lnavAvailable, routeDebug).toBe(true);
      expect(sample.fmaLateralActive, routeDebug).toBe('LNAV');
      expect(sample.autopilotStatus, routeDebug).toBe('CMD_A');
      expect(sample.fmaAutopilotStatus, routeDebug).toBe('CMD_A');
      expect(sample.thrustActive, routeDebug).toBe('SPEED');
      expect(sample.fmaThrustActive, routeDebug).toBe('SPEED');
      expect(sample.verticalActive, routeDebug).toBe('OFF');
      expect(sample.fmaVerticalActive, routeDebug).toBe('OFF');
      expect(sample.weightOnWheels, routeDebug).toBe(false);
      expect(sample.flightPhase, routeDebug).not.toBe('LANDED');
    }
    for (let i = 1; i < result.samples.length; i += 1) {
      expect(result.samples[i].distanceToNextNm, routeDebug).toBeLessThanOrEqual(result.samples[i - 1].distanceToNextNm + 0.05);
    }
  });

  test('KSEA final route approach can hand off from backed automation to manual controls truthfully', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaFinalRouteApproachToManualHandoff(page);
    const routeDebug = JSON.stringify(result, null, 2);

    expect(result.configuredApproach.routeName).toBe('KSEA→KPDX');
    expect(result.configuredApproach.activeLegIndex, routeDebug).toBe(4);
    expect(result.configuredApproach.fromIdent, routeDebug).toBe('KPDX10R_FAF');
    expect(result.configuredApproach.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    expect(result.configuredApproach.lnavAvailable, routeDebug).toBe(true);
    expect(result.configuredApproach.lateralActive, routeDebug).toBe('LNAV');
    expect(result.configuredApproach.fmaLateralActive, routeDebug).toBe('LNAV');
    expect(result.configuredApproach.autopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.configuredApproach.fmaAutopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.configuredApproach.thrustActive, routeDebug).toBe('SPEED');
    expect(result.configuredApproach.fmaThrustActive, routeDebug).toBe('SPEED');
    expect(result.configuredApproach.verticalActive, routeDebug).toBe('OFF');
    expect(result.configuredApproach.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.configuredApproach.gearDown, routeDebug).toBe(true);
    expect(result.configuredApproach.gearLever, routeDebug).toBe('DOWN');
    expect(result.configuredApproach.flapSetting, routeDebug).toBeGreaterThanOrEqual(25);
    expect(result.configuredApproach.weightOnWheels, routeDebug).toBe(false);

    expect(result.manualHandoff.routeName).toBe('KSEA→KPDX');
    expect(result.manualHandoff.activeLegIndex, routeDebug).toBe(4);
    expect(result.manualHandoff.fromIdent, routeDebug).toBe('KPDX10R_FAF');
    expect(result.manualHandoff.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    expect(result.manualHandoff.lnavAvailable, routeDebug).toBe(true);
    expect(result.manualHandoff.lateralActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaLateralActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.autopilotStatus, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(result.manualHandoff.thrustActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaThrustActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.verticalActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.apCommandCount, routeDebug).toBe(0);
    expect(result.manualHandoff.pilotInputs.elevator, routeDebug).toBe(result.manualHandoff.effectiveControls.elevator);
    expect(result.manualHandoff.pilotInputs.aileron, routeDebug).toBe(result.manualHandoff.effectiveControls.aileron);
    expect(result.manualHandoff.pilotInputs.throttle1, routeDebug).toBe(result.manualHandoff.effectiveControls.throttle1);
    expect(result.manualHandoff.pilotInputs.throttle2, routeDebug).toBe(result.manualHandoff.effectiveControls.throttle2);

    expect(result.samples.length, routeDebug).toBeGreaterThan(1);
    const handoffSampleIndex = result.samples.length - 1;
    const configuredApproachSampleIndex = handoffSampleIndex - 1;
    const preHandoffSamples = result.samples.slice(0, handoffSampleIndex);
    const afterHandoffSample = result.samples[handoffSampleIndex];

    expect(result.samples[configuredApproachSampleIndex], routeDebug).toEqual(result.configuredApproach);
    expect(afterHandoffSample, routeDebug).toEqual(result.manualHandoff);
    expect(preHandoffSamples.length, routeDebug).toBeGreaterThan(0);
    for (const sample of preHandoffSamples) {
      expect(sample.autopilotStatus, routeDebug).toBe('CMD_A');
      expect(sample.fmaAutopilotStatus, routeDebug).toBe('CMD_A');
      expect(sample.lateralActive, routeDebug).toBe('LNAV');
      expect(sample.fmaLateralActive, routeDebug).toBe('LNAV');
      expect(sample.thrustActive, routeDebug).toBe('SPEED');
      expect(sample.fmaThrustActive, routeDebug).toBe('SPEED');
      expect(sample.verticalActive, routeDebug).toBe('OFF');
      expect(sample.fmaVerticalActive, routeDebug).toBe('OFF');
    }
    expect(afterHandoffSample.autopilotStatus, routeDebug).toBe('OFF');
    expect(afterHandoffSample.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(afterHandoffSample.lateralActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.fmaLateralActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.verticalActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.thrustActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.fmaThrustActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.apCommandCount, routeDebug).toBe(0);
    for (const sample of result.samples) {
      expect(sample.weightOnWheels, routeDebug).toBe(false);
      expect(sample.flightPhase, routeDebug).not.toBe('LANDED');
    }
  });

  test('KSEA final route manual handoff can reset without stale route or automation truth', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaFinalRouteApproachManualHandoffAndReset(page);
    const routeDebug = JSON.stringify(result, null, 2);

    expect(result.configuredApproach.routeName).toBe('KSEA→KPDX');
    expect(result.configuredApproach.activeLegIndex, routeDebug).toBe(4);
    expect(result.configuredApproach.fromIdent, routeDebug).toBe('KPDX10R_FAF');
    expect(result.configuredApproach.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    expect(result.configuredApproach.lnavAvailable, routeDebug).toBe(true);
    expect(result.configuredApproach.lateralActive, routeDebug).toBe('LNAV');
    expect(result.configuredApproach.fmaLateralActive, routeDebug).toBe('LNAV');
    expect(result.configuredApproach.autopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.configuredApproach.fmaAutopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.configuredApproach.thrustActive, routeDebug).toBe('SPEED');
    expect(result.configuredApproach.fmaThrustActive, routeDebug).toBe('SPEED');
    expect(result.configuredApproach.verticalActive, routeDebug).toBe('OFF');
    expect(result.configuredApproach.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.configuredApproach.gearDown, routeDebug).toBe(true);
    expect(result.configuredApproach.gearLever, routeDebug).toBe('DOWN');
    expect(result.configuredApproach.flapSetting, routeDebug).toBeGreaterThanOrEqual(25);
    expect(result.configuredApproach.weightOnWheels, routeDebug).toBe(false);
    expect(result.configuredApproach.flightPhase, routeDebug).not.toBe('LANDED');

    expect(result.manualHandoff.routeName).toBe('KSEA→KPDX');
    expect(result.manualHandoff.activeLegIndex, routeDebug).toBe(4);
    expect(result.manualHandoff.fromIdent, routeDebug).toBe('KPDX10R_FAF');
    expect(result.manualHandoff.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    expect(result.manualHandoff.lnavAvailable, routeDebug).toBe(true);
    expect(result.manualHandoff.lateralActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaLateralActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.autopilotStatus, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(result.manualHandoff.thrustActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaThrustActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.verticalActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.apCommandCount, routeDebug).toBe(0);
    expect(result.manualHandoff.pilotInputs.elevator, routeDebug).toBe(result.manualHandoff.effectiveControls.elevator);
    expect(result.manualHandoff.pilotInputs.aileron, routeDebug).toBe(result.manualHandoff.effectiveControls.aileron);
    expect(result.manualHandoff.pilotInputs.throttle1, routeDebug).toBe(result.manualHandoff.effectiveControls.throttle1);
    expect(result.manualHandoff.pilotInputs.throttle2, routeDebug).toBe(result.manualHandoff.effectiveControls.throttle2);
    expect(result.manualHandoff.weightOnWheels, routeDebug).toBe(false);
    expect(result.manualHandoff.flightPhase, routeDebug).not.toBe('LANDED');

    expect(result.reset.flightPlan, routeDebug).toBeNull();
    expect(result.reset.activeLegIndex, routeDebug).toBeNull();
    expect(result.reset.apStateCleared, routeDebug).toBe(true);
    expect(result.reset.routeName, routeDebug).toBe('NO ROUTE');
    expect(result.reset.lnavAvailable, routeDebug).toBe(false);
    expect(result.reset.autopilotStatus, routeDebug).toBe('OFF');
    expect(result.reset.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(result.reset.lateralActive, routeDebug).toBe('OFF');
    expect(result.reset.fmaLateralActive, routeDebug).toBe('OFF');
    expect(result.reset.verticalActive, routeDebug).toBe('OFF');
    expect(result.reset.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.reset.thrustActive, routeDebug).toBe('OFF');
    expect(result.reset.fmaThrustActive, routeDebug).toBe('OFF');
    expect(result.reset.apCommandCount, routeDebug).toBe(0);
    expect(result.reset.status, routeDebug).toBe('stopped');
    expect(result.reset.guidancePhase, routeDebug).toBe('preflight');
    expect(result.reset.weightOnWheels, routeDebug).toBe(true);

    expect(result.samples.length, routeDebug).toBeGreaterThan(1);
    expect(result.samples).not.toContainEqual(result.reset);
    const handoffSampleIndex = result.samples.length - 1;
    const preHandoffSamples = result.samples.slice(0, handoffSampleIndex);
    const afterHandoffSample = result.samples[handoffSampleIndex];

    expect(afterHandoffSample, routeDebug).toEqual(result.manualHandoff);
    expect(preHandoffSamples.length, routeDebug).toBeGreaterThan(0);
    for (const sample of preHandoffSamples) {
      expect(sample.routeName, routeDebug).toBe('KSEA→KPDX');
      expect(sample.autopilotStatus, routeDebug).toBe('CMD_A');
      expect(sample.fmaAutopilotStatus, routeDebug).toBe('CMD_A');
      expect(sample.lateralActive, routeDebug).toBe('LNAV');
      expect(sample.fmaLateralActive, routeDebug).toBe('LNAV');
      expect(sample.thrustActive, routeDebug).toBe('SPEED');
      expect(sample.fmaThrustActive, routeDebug).toBe('SPEED');
      expect(sample.verticalActive, routeDebug).toBe('OFF');
      expect(sample.fmaVerticalActive, routeDebug).toBe('OFF');
    }
    expect(afterHandoffSample.autopilotStatus, routeDebug).toBe('OFF');
    expect(afterHandoffSample.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(afterHandoffSample.lateralActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.fmaLateralActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.verticalActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.thrustActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.fmaThrustActive, routeDebug).toBe('OFF');
    expect(afterHandoffSample.apCommandCount, routeDebug).toBe(0);
  });

  test('KSEA final route handoff can bridge to KPDX landing without hidden automation', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaFinalRouteHandoffToKpdxLandingAndReset(page);
    const routeDebug = JSON.stringify(result, null, 2);

    expect(result.configuredApproach.routeName).toBe('KSEA→KPDX');
    expect(result.configuredApproach.activeLegIndex, routeDebug).toBe(4);
    expect(result.configuredApproach.fromIdent, routeDebug).toBe('KPDX10R_FAF');
    expect(result.configuredApproach.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    expect(result.configuredApproach.lnavAvailable, routeDebug).toBe(true);
    expect(result.configuredApproach.autopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.configuredApproach.fmaAutopilotStatus, routeDebug).toBe('CMD_A');
    expect(result.configuredApproach.lateralActive, routeDebug).toBe('LNAV');
    expect(result.configuredApproach.fmaLateralActive, routeDebug).toBe('LNAV');
    expect(result.configuredApproach.thrustActive, routeDebug).toBe('SPEED');
    expect(result.configuredApproach.fmaThrustActive, routeDebug).toBe('SPEED');
    expect(result.configuredApproach.verticalActive, routeDebug).toBe('OFF');
    expect(result.configuredApproach.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.configuredApproach.gearDown, routeDebug).toBe(true);
    expect(result.configuredApproach.gearLever, routeDebug).toBe('DOWN');
    expect(result.configuredApproach.flapSetting, routeDebug).toBeGreaterThanOrEqual(25);
    expect(result.configuredApproach.weightOnWheels, routeDebug).toBe(false);
    expect(result.configuredApproach.guidancePhase, routeDebug).toBe('approach');
    expect(result.configuredApproach.flightPhase, routeDebug).not.toBe('LANDED');

    expect(result.manualHandoff.routeName, routeDebug).toBe('KSEA→KPDX');
    expect(result.manualHandoff.activeLegIndex, routeDebug).toBe(4);
    expect(result.manualHandoff.fromIdent, routeDebug).toBe('KPDX10R_FAF');
    expect(result.manualHandoff.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    expect(result.manualHandoff.lnavAvailable, routeDebug).toBe(true);
    expect(result.manualHandoff.autopilotStatus, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(result.manualHandoff.lateralActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaLateralActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.verticalActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.thrustActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.fmaThrustActive, routeDebug).toBe('OFF');
    expect(result.manualHandoff.apCommandCount, routeDebug).toBe(0);
    expect(result.manualHandoff.pilotInputs.elevator, routeDebug).toBe(result.manualHandoff.effectiveControls.elevator);
    expect(result.manualHandoff.pilotInputs.aileron, routeDebug).toBe(result.manualHandoff.effectiveControls.aileron);
    expect(result.manualHandoff.pilotInputs.throttle1, routeDebug).toBe(result.manualHandoff.effectiveControls.throttle1);
    expect(result.manualHandoff.pilotInputs.throttle2, routeDebug).toBe(result.manualHandoff.effectiveControls.throttle2);
    expect(result.manualHandoff.weightOnWheels, routeDebug).toBe(false);
    expect(result.manualHandoff.flightPhase, routeDebug).not.toBe('LANDED');

    expect(result.samples.slice(-4), routeDebug).toEqual([
      result.manualHandoff,
      result.landingApproach,
      result.touchdown,
      result.rollout,
    ]);
    expect(result.samples.some((sample) => sample.routeName === 'NO ROUTE'), routeDebug).toBe(false);
    expect(result.samples, routeDebug).not.toContainEqual(result.reset);
    expect(result.landingApproach.routeName, routeDebug).toBe('KSEA→KPDX');
    expect(result.landingApproach.activeLegIndex, routeDebug).toBe(4);
    expect(result.landingApproach.fromIdent, routeDebug).toBe('KPDX10R_FAF');
    expect(result.landingApproach.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    expect(result.landingApproach.lnavAvailable, routeDebug).toBe(false);
    expect(result.landingApproach.routeComplete, routeDebug).toBe(true);
    expect(result.landingApproach.autopilotStatus, routeDebug).toBe('OFF');
    expect(result.landingApproach.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(result.landingApproach.lateralActive, routeDebug).toBe('OFF');
    expect(result.landingApproach.fmaLateralActive, routeDebug).toBe('OFF');
    expect(result.landingApproach.verticalActive, routeDebug).toBe('OFF');
    expect(result.landingApproach.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.landingApproach.thrustActive, routeDebug).toBe('OFF');
    expect(result.landingApproach.fmaThrustActive, routeDebug).toBe('OFF');
    expect(result.landingApproach.apCommandCount, routeDebug).toBe(0);
    expect(result.landingApproach.surfaceAirport, routeDebug).toBe('KPDX');
    expect(result.landingApproach.surfaceRunwayId, routeDebug).toBe('10R');
    expect(result.landingApproach.gearDown, routeDebug).toBe(true);
    expect(result.landingApproach.flapSetting, routeDebug).toBeGreaterThanOrEqual(25);
    expect(result.landingApproach.guidancePhase, routeDebug).toBe('approach');
    expect(result.landingApproach.weightOnWheels, routeDebug).toBe(false);
    expect(result.landingApproach.flightPhase, routeDebug).not.toBe('LANDED');
    expect(result.landingApproach.distanceToNextNm, routeDebug).toBeLessThan(1.0);
    expect(result.landingApproach.distanceToNextNm, routeDebug).toBeLessThanOrEqual(result.manualHandoff.distanceToNextNm - 3.0);

    expect(result.touchdown.flightPhase, routeDebug).toBe('TOUCHDOWN');
    expect(result.touchdown.groundContact, routeDebug).toBe('gear');
    expect(result.touchdown.weightOnWheels, routeDebug).toBe(true);
    expect(result.touchdown.onRunway, routeDebug).toBe(true);
    expect(result.touchdown.surfaceAirport, routeDebug).toBe('KPDX');
    expect(result.touchdown.surfaceRunwayId, routeDebug).toBe('10R');
    expect(result.touchdown.touchdownSinkRateMps, routeDebug).toBeGreaterThan(0);
    expect(result.touchdown.touchdownSinkRateMps, routeDebug).toBeLessThan(15);
    expect(result.touchdown.autopilotStatus, routeDebug).toBe('OFF');
    expect(result.touchdown.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(result.touchdown.lateralActive, routeDebug).toBe('OFF');
    expect(result.touchdown.fmaLateralActive, routeDebug).toBe('OFF');
    expect(result.touchdown.verticalActive, routeDebug).toBe('OFF');
    expect(result.touchdown.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.touchdown.thrustActive, routeDebug).toBe('OFF');
    expect(result.touchdown.fmaThrustActive, routeDebug).toBe('OFF');
    expect(result.touchdown.apCommandCount, routeDebug).toBe(0);
    expect(result.touchdown.routeName, routeDebug).toBe('KSEA→KPDX');
    expect(result.touchdown.activeLegIndex, routeDebug).toBe(4);
    expect(result.touchdown.distanceToNextNm, routeDebug).toBeLessThan(1.0);

    expect(result.rollout.groundSpeedKt, routeDebug).toBeLessThan(result.touchdown.groundSpeedKt);
    expect(ROLLOUT_GUIDANCE_PHASES, routeDebug).toContain(result.rollout.guidancePhase);
    expectExplicitLandingSequence(result.landingPhases, routeDebug);
    expect(result.rollout.autopilotStatus, routeDebug).toBe('OFF');
    expect(result.rollout.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(result.rollout.lateralActive, routeDebug).toBe('OFF');
    expect(result.rollout.fmaLateralActive, routeDebug).toBe('OFF');
    expect(result.rollout.verticalActive, routeDebug).toBe('OFF');
    expect(result.rollout.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.rollout.thrustActive, routeDebug).toBe('OFF');
    expect(result.rollout.fmaThrustActive, routeDebug).toBe('OFF');
    expect(result.rollout.apCommandCount, routeDebug).toBe(0);
    expect(result.rollout.distanceToNextNm, routeDebug).toBeLessThan(1.0);

    expect(result.reset.flightPlan, routeDebug).toBeNull();
    expect(result.reset.activeLegIndex, routeDebug).toBeNull();
    expect(result.reset.apStateCleared, routeDebug).toBe(true);
    expect(result.reset.routeName, routeDebug).toBe('NO ROUTE');
    expect(result.reset.lnavAvailable, routeDebug).toBe(false);
    expect(result.reset.autopilotStatus, routeDebug).toBe('OFF');
    expect(result.reset.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(result.reset.lateralActive, routeDebug).toBe('OFF');
    expect(result.reset.fmaLateralActive, routeDebug).toBe('OFF');
    expect(result.reset.verticalActive, routeDebug).toBe('OFF');
    expect(result.reset.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.reset.thrustActive, routeDebug).toBe('OFF');
    expect(result.reset.fmaThrustActive, routeDebug).toBe('OFF');
    expect(result.reset.apCommandCount, routeDebug).toBe(0);
    expect(result.reset.status, routeDebug).toBe('stopped');
    expect(result.reset.guidancePhase, routeDebug).toBe('preflight');
    expect(result.reset.weightOnWheels, routeDebug).toBe(true);
  });

  test('KSEA final route extended descent can bridge to KPDX landing without hidden automation', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaFinalRouteExtendedDescentToKpdxLandingAndReset(page);
    const routeDebug = JSON.stringify(result, null, 2);
    const expectLoadedKpdx10rThreshold = (sample: typeof result.configuredApproach): void => {
      expect(sample.routeName, routeDebug).toBe('KSEA→KPDX');
      expect(sample.activeLegIndex, routeDebug).toBe(4);
      expect(sample.fromIdent, routeDebug).toBe('KPDX10R_FAF');
      expect(sample.nextWaypointIdent, routeDebug).toBe('KPDX10R_RWY');
    };
    const expectCoupledApproachTruth = (sample: typeof result.configuredApproach): void => {
      expect(sample.autopilotStatus, routeDebug).toBe('CMD_A');
      expect(sample.fmaAutopilotStatus, routeDebug).toBe('CMD_A');
      expect(sample.lateralActive, routeDebug).toBe('LNAV');
      expect(sample.fmaLateralActive, routeDebug).toBe('LNAV');
      expect(sample.thrustActive, routeDebug).toBe('SPEED');
      expect(sample.fmaThrustActive, routeDebug).toBe('SPEED');
      expect(sample.verticalActive, routeDebug).toBe('OFF');
      expect(sample.fmaVerticalActive, routeDebug).toBe('OFF');
    };
    const expectManualTruth = (sample: typeof result.manualHandoff): void => {
      expect(sample.autopilotStatus, routeDebug).toBe('OFF');
      expect(sample.fmaAutopilotStatus, routeDebug).toBe('OFF');
      expect(sample.lateralActive, routeDebug).toBe('OFF');
      expect(sample.fmaLateralActive, routeDebug).toBe('OFF');
      expect(sample.verticalActive, routeDebug).toBe('OFF');
      expect(sample.fmaVerticalActive, routeDebug).toBe('OFF');
      expect(sample.thrustActive, routeDebug).toBe('OFF');
      expect(sample.fmaThrustActive, routeDebug).toBe('OFF');
      expect(sample.apCommandCount, routeDebug).toBe(0);
    };
    const expectManualControls = (sample: typeof result.manualHandoff): void => {
      expect(sample.pilotInputs.elevator, routeDebug).toBe(sample.effectiveControls.elevator);
      expect(sample.pilotInputs.aileron, routeDebug).toBe(sample.effectiveControls.aileron);
      expect(sample.pilotInputs.throttle1, routeDebug).toBe(sample.effectiveControls.throttle1);
      expect(sample.pilotInputs.throttle2, routeDebug).toBe(sample.effectiveControls.throttle2);
    };
    const expectAirborneApproach = (sample: typeof result.configuredApproach): void => {
      expect(sample.lnavAvailable, routeDebug).toBe(true);
      expect(sample.routeComplete, routeDebug).toBe(false);
      expect(sample.gearDown, routeDebug).toBe(true);
      expect(sample.gearLever, routeDebug).toBe('DOWN');
      expect(sample.flapSetting, routeDebug).toBeGreaterThanOrEqual(25);
      expect(sample.guidancePhase, routeDebug).toBe('approach');
      expect(sample.weightOnWheels, routeDebug).toBe(false);
      expect(sample.flightPhase, routeDebug).not.toBe('LANDED');
    };
    const sampleMatches = (sample: typeof result.configuredApproach, expected: typeof result.configuredApproach): boolean => sample.distanceToNextNm === expected.distanceToNextNm && sample.altitudeFt === expected.altitudeFt;

    expectLoadedKpdx10rThreshold(result.configuredApproach);
    expectCoupledApproachTruth(result.configuredApproach);
    expectAirborneApproach(result.configuredApproach);

    expectLoadedKpdx10rThreshold(result.extendedDescent);
    expectCoupledApproachTruth(result.extendedDescent);
    expect(result.extendedDescent.distanceToNextNm, routeDebug).toBeLessThanOrEqual(result.configuredApproach.distanceToNextNm - 1.0);
    expect(result.extendedDescent.altitudeFt, routeDebug).toBeLessThanOrEqual(result.configuredApproach.altitudeFt - 300);
    expect(result.extendedDescent.aglFt, routeDebug).toBeLessThanOrEqual(result.configuredApproach.aglFt - 300);
    expectAirborneApproach(result.extendedDescent);

    const configuredApproachSampleIndex = result.samples.findIndex((sample) => sampleMatches(sample, result.configuredApproach));
    const extendedDescentSampleIndex = result.samples.findIndex((sample) => sampleMatches(sample, result.extendedDescent));
    expect(configuredApproachSampleIndex, routeDebug).toBeGreaterThanOrEqual(0);
    expect(extendedDescentSampleIndex, routeDebug).toBeGreaterThan(configuredApproachSampleIndex);
    const preHandoffSamples = result.samples.slice(configuredApproachSampleIndex, extendedDescentSampleIndex + 1);
    expect(preHandoffSamples[0], routeDebug).toEqual(result.configuredApproach);
    expect(preHandoffSamples[preHandoffSamples.length - 1], routeDebug).toEqual(result.extendedDescent);
    for (const sample of preHandoffSamples) {
      expectLoadedKpdx10rThreshold(sample);
      expectCoupledApproachTruth(sample);
      expect(sample.weightOnWheels, routeDebug).toBe(false);
      expect(sample.flightPhase, routeDebug).not.toBe('LANDED');
    }
    for (let i = 1; i < preHandoffSamples.length; i += 1) {
      expect(preHandoffSamples[i].distanceToNextNm, routeDebug).toBeLessThanOrEqual(preHandoffSamples[i - 1].distanceToNextNm + 0.05);
    }

    expectLoadedKpdx10rThreshold(result.manualHandoff);
    expect(result.manualHandoff.lnavAvailable, routeDebug).toBe(true);
    expect(result.manualHandoff.routeComplete, routeDebug).toBe(false);
    expectManualTruth(result.manualHandoff);
    expectManualControls(result.manualHandoff);
    expect(result.manualHandoff.weightOnWheels, routeDebug).toBe(false);
    expect(result.manualHandoff.flightPhase, routeDebug).not.toBe('LANDED');

    expect(result.samples.slice(-5), routeDebug).toEqual([
      result.extendedDescent,
      result.manualHandoff,
      result.landingApproach,
      result.touchdown,
      result.rollout,
    ]);
    expect(result.samples.some((sample) => sample.routeName === 'NO ROUTE'), routeDebug).toBe(false);
    expect(result.samples, routeDebug).not.toContainEqual(result.reset);

    expectLoadedKpdx10rThreshold(result.landingApproach);
    expect(result.landingApproach.lnavAvailable, routeDebug).toBe(false);
    expect(result.landingApproach.routeComplete, routeDebug).toBe(true);
    expectManualTruth(result.landingApproach);
    expect(result.landingApproach.surfaceAirport, routeDebug).toBe('KPDX');
    expect(result.landingApproach.surfaceRunwayId, routeDebug).toBe('10R');
    expect(result.landingApproach.gearDown, routeDebug).toBe(true);
    expect(result.landingApproach.flapSetting, routeDebug).toBeGreaterThanOrEqual(25);
    expect(result.landingApproach.guidancePhase, routeDebug).toBe('approach');
    expect(result.landingApproach.weightOnWheels, routeDebug).toBe(false);
    expect(result.landingApproach.flightPhase, routeDebug).not.toBe('LANDED');
    expect(result.landingApproach.distanceToNextNm, routeDebug).toBeLessThan(1.0);
    expect(result.landingApproach.distanceToNextNm, routeDebug).toBeLessThanOrEqual(result.manualHandoff.distanceToNextNm - 2.5);

    expect(result.touchdown.flightPhase, routeDebug).toBe('TOUCHDOWN');
    expect(result.touchdown.groundContact, routeDebug).toBe('gear');
    expect(result.touchdown.weightOnWheels, routeDebug).toBe(true);
    expect(result.touchdown.onRunway, routeDebug).toBe(true);
    expect(result.touchdown.surfaceAirport, routeDebug).toBe('KPDX');
    expect(result.touchdown.surfaceRunwayId, routeDebug).toBe('10R');
    expect(result.touchdown.touchdownSinkRateMps, routeDebug).toBeGreaterThan(0);
    expect(result.touchdown.touchdownSinkRateMps, routeDebug).toBeLessThan(15);
    expectLoadedKpdx10rThreshold(result.touchdown);
    expect(result.touchdown.lnavAvailable, routeDebug).toBe(false);
    expect(result.touchdown.routeComplete, routeDebug).toBe(true);
    expectManualTruth(result.touchdown);
    expect(result.touchdown.distanceToNextNm, routeDebug).toBeLessThan(1.0);

    expect(result.rollout.groundSpeedKt, routeDebug).toBeLessThan(result.touchdown.groundSpeedKt);
    expect(ROLLOUT_GUIDANCE_PHASES, routeDebug).toContain(result.rollout.guidancePhase);
    expectExplicitLandingSequence(result.landingPhases, routeDebug);
    expectManualTruth(result.rollout);
    expect(result.rollout.distanceToNextNm, routeDebug).toBeLessThan(1.0);

    expect(result.reset.flightPlan, routeDebug).toBeNull();
    expect(result.reset.activeLegIndex, routeDebug).toBeNull();
    expect(result.reset.apStateCleared, routeDebug).toBe(true);
    expect(result.reset.routeName, routeDebug).toBe('NO ROUTE');
    expect(result.reset.lnavAvailable, routeDebug).toBe(false);
    expect(result.reset.autopilotStatus, routeDebug).toBe('OFF');
    expect(result.reset.fmaAutopilotStatus, routeDebug).toBe('OFF');
    expect(result.reset.lateralActive, routeDebug).toBe('OFF');
    expect(result.reset.fmaLateralActive, routeDebug).toBe('OFF');
    expect(result.reset.verticalActive, routeDebug).toBe('OFF');
    expect(result.reset.fmaVerticalActive, routeDebug).toBe('OFF');
    expect(result.reset.thrustActive, routeDebug).toBe('OFF');
    expect(result.reset.fmaThrustActive, routeDebug).toBe('OFF');
    expect(result.reset.apCommandCount, routeDebug).toBe(0);
    expect(result.reset.status, routeDebug).toBe('stopped');
    expect(result.reset.guidancePhase, routeDebug).toBe('preflight');
    expect(result.reset.weightOnWheels, routeDebug).toBe(true);
  });
});
