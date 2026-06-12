import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';
import {
  flyKseaFinalRouteApproachToManualHandoff,
  flyKseaFinalRouteToConfiguredApproach,
  flyKseaRouteThroughFirstSequence,
  flyKseaRouteThroughMultiGateProgression,
  flyKseaRouteThroughSecondSequence,
  flyKseaRouteWithLnav,
} from './helpers/rfsRoute';

test.describe('RFS route and LNAV browser proof', () => {
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

  test('KSEA sample route sequences from BTG to KPDX while LNAV remains backed', async ({ page }) => {
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
    expect(result.final.nextWaypointIdent, routeDebug).toBe('KPDX');
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
    expect(result.final.nextWaypointIdent, routeDebug).toBe('KPDX');
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
    expect(result.initial.activeLegIndex).toBe(2);
    expect(result.initial.fromIdent, routeDebug).toBe('BTG');
    expect(result.initial.nextWaypointIdent, routeDebug).toBe('KPDX');
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
    expect(result.configuredApproach.activeLegIndex, routeDebug).toBe(2);
    expect(result.configuredApproach.fromIdent, routeDebug).toBe('BTG');
    expect(result.configuredApproach.nextWaypointIdent, routeDebug).toBe('KPDX');
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
    expect(result.configuredApproach.activeLegIndex, routeDebug).toBe(2);
    expect(result.configuredApproach.fromIdent, routeDebug).toBe('BTG');
    expect(result.configuredApproach.nextWaypointIdent, routeDebug).toBe('KPDX');
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
    expect(result.manualHandoff.activeLegIndex, routeDebug).toBe(2);
    expect(result.manualHandoff.fromIdent, routeDebug).toBe('BTG');
    expect(result.manualHandoff.nextWaypointIdent, routeDebug).toBe('KPDX');
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
});
