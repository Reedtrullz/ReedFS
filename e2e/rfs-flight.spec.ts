import { expect, test } from '@playwright/test';
import { openRfs, startRoll } from './helpers/rfsPage';
import {
  flyApproachToLandingRolloutAndReset,
  flyDescentApproachToLandingRolloutAndReset,
  flyEnvaTakeoffToCleanClimb,
  flyKpdxShortFinalToLandingRolloutAndReset,
} from './helpers/rfsFlight';

const EXPECTED_LANDING_PHASES = ['TOUCHDOWN', 'DEROTATION', 'ROLLOUT', 'STOPPED'];
const ROLLOUT_GUIDANCE_PHASES = ['landing-rollout', 'taxi', 'stopped'];

function expectExplicitLandingSequence(phases: string[]): void {
  expect(phases).toEqual(expect.arrayContaining(EXPECTED_LANDING_PHASES));
  expect(phases).not.toContain('LANDED');
  expect(phases.indexOf('TOUCHDOWN')).toBeLessThan(phases.indexOf('DEROTATION'));
  expect(phases.indexOf('DEROTATION')).toBeLessThan(phases.indexOf('ROLLOUT'));
  expect(phases.indexOf('ROLLOUT')).toBeLessThan(phases.indexOf('STOPPED'));
}

test.describe('RFS playable flight loops', () => {
  test('ENVA tutorial reaches clean climb with phase-aware guidance', async ({ page }) => {
    await openRfs(page);
    await startRoll(page);

    const snapshot = await flyEnvaTakeoffToCleanClimb(page);

    expect(snapshot.weightOnWheels).toBe(false);
    expect(snapshot.gearDown).toBe(false);
    expect(snapshot.gearLever).toBe('UP');
    expect(snapshot.aglFt).toBeGreaterThan(200);
    expect(snapshot.iasKt).toBeGreaterThan(130);
    expect(snapshot.phase).toBe('climb');
    expect(snapshot.coachMessage).toMatch(/climb stable/i);
    expect(snapshot.checklistLabels).toContain('Gear up');
    expect(snapshot.checklistLabels).not.toContain('Gear down');
  });

  test('ENVA short-final landing approach touches down, rolls out under braking, and resets cleanly', async ({ page }) => {
    await openRfs(page);

    const proof = await flyApproachToLandingRolloutAndReset(page);

    expect(proof.approach.guidancePhase).toBe('approach');
    expect(proof.approach.gearDown).toBe(true);
    expect(proof.approach.weightOnWheels).toBe(false);
    expect(proof.approach.aglFt).toBeGreaterThan(50);

    expect(proof.touchdown.weightOnWheels).toBe(true);
    expect(proof.touchdown.onRunway).toBe(true);
    expect(proof.touchdown.groundContact).toBe('gear');
    expect(proof.touchdown.flightPhase).toBe('TOUCHDOWN');
    expect(proof.touchdown.touchdownSinkRateMps).toBeGreaterThan(0);
    expect(proof.touchdown.touchdownSinkRateMps).toBeLessThan(15);

    expect(proof.rollout.groundSpeedKt).toBeLessThan(proof.touchdown.groundSpeedKt);
    expect(ROLLOUT_GUIDANCE_PHASES).toContain(proof.rollout.guidancePhase);
    expectExplicitLandingSequence(proof.landingPhases);

    expect(proof.reset.status).toBe('stopped');
    expect(proof.reset.guidancePhase).toBe('preflight');
    expect(proof.reset.weightOnWheels).toBe(true);
    expect(proof.reset.autopilotCleared).toBe(true);
    expect(proof.reset.routeCleared).toBe(true);
  });

  test('ENVA seeded descent configures approach, lands, rolls out, and resets without an intermediate store reset', async ({ page }) => {
    await openRfs(page);

    const proof = await flyDescentApproachToLandingRolloutAndReset(page);

    expect(proof.descent.flightPhase).toBe('DESCENT');
    expect(proof.descent.guidancePhase).toBe('approach');
    expect(proof.descent.weightOnWheels).toBe(false);
    expect(proof.descent.aglFt).toBeGreaterThan(300);
    expect(proof.descent.autopilotCleared).toBe(true);
    expect(proof.descent.routeCleared).toBe(true);

    expect(proof.configuredApproach.gearDown).toBe(true);
    expect(proof.configuredApproach.gearLever).toBe('DOWN');
    expect(proof.configuredApproach.flapSetting).toBeGreaterThanOrEqual(25);
    expect(proof.configuredApproach.guidancePhase).toBe('approach');
    expect(proof.configuredApproach.weightOnWheels).toBe(false);
    expect(proof.configuredApproach.aglFt).toBeLessThan(proof.descent.aglFt);
    expect(proof.configuredApproach.verticalSpeedFpm).toBeLessThan(0);
    expect(proof.configuredApproach.iasKt).toBeGreaterThan(110);

    expect(proof.touchdown.flightPhase).toBe('TOUCHDOWN');
    expect(proof.touchdown.groundContact).toBe('gear');
    expect(proof.touchdown.weightOnWheels).toBe(true);
    expect(proof.touchdown.onRunway).toBe(true);
    expect(proof.touchdown.touchdownSinkRateMps).toBeGreaterThan(0);
    expect(proof.touchdown.touchdownSinkRateMps).toBeLessThan(15);

    expect(proof.rollout.groundSpeedKt).toBeLessThan(proof.touchdown.groundSpeedKt);
    expect(ROLLOUT_GUIDANCE_PHASES).toContain(proof.rollout.guidancePhase);
    expectExplicitLandingSequence(proof.landingPhases);

    expect(proof.reset.status).toBe('stopped');
    expect(proof.reset.guidancePhase).toBe('preflight');
    expect(proof.reset.weightOnWheels).toBe(true);
    expect(proof.reset.autopilotCleared).toBe(true);
    expect(proof.reset.routeCleared).toBe(true);
  });

  test('KPDX short-final approach touches down on prepared runway, rolls out, and resets cleanly', async ({ page }) => {
    await openRfs(page);

    const proof = await flyKpdxShortFinalToLandingRolloutAndReset(page);

    expect(proof.approach.guidancePhase).toBe('approach');
    expect(proof.approach.gearDown).toBe(true);
    expect(proof.approach.gearLever).toBe('DOWN');
    expect(proof.approach.weightOnWheels).toBe(false);
    expect(proof.approach.aglFt).toBeGreaterThan(50);
    expect(proof.approach.autopilotCleared).toBe(true);
    expect(proof.approach.routeCleared).toBe(true);

    expect(proof.touchdown.flightPhase).toBe('TOUCHDOWN');
    expect(proof.touchdown.groundContact).toBe('gear');
    expect(proof.touchdown.weightOnWheels).toBe(true);
    expect(proof.touchdown.onRunway).toBe(true);
    expect(proof.touchdown.surfaceAirport).toBe('KPDX');
    expect(proof.touchdown.surfaceRunwayId).toBe('10L');
    expect(proof.touchdown.touchdownSinkRateMps).toBeGreaterThan(0);
    expect(proof.touchdown.touchdownSinkRateMps).toBeLessThan(15);

    expect(proof.rollout.groundSpeedKt).toBeLessThan(proof.touchdown.groundSpeedKt);
    expect(ROLLOUT_GUIDANCE_PHASES).toContain(proof.rollout.guidancePhase);
    expectExplicitLandingSequence(proof.landingPhases);

    expect(proof.reset.status).toBe('stopped');
    expect(proof.reset.guidancePhase).toBe('preflight');
    expect(proof.reset.weightOnWheels).toBe(true);
    expect(proof.reset.autopilotCleared).toBe(true);
    expect(proof.reset.routeCleared).toBe(true);
  });
});
