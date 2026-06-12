import { expect, test } from '@playwright/test';
import { openRfs, startRoll } from './helpers/rfsPage';
import { flyApproachToLandingRolloutAndReset, flyEnvaTakeoffToCleanClimb } from './helpers/rfsFlight';

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

  test('ENVA short-final approach touches down, rolls out under braking, and resets cleanly', async ({ page }) => {
    await openRfs(page);

    const proof = await flyApproachToLandingRolloutAndReset(page);

    expect(proof.approach.guidancePhase).toBe('approach');
    expect(proof.approach.gearDown).toBe(true);
    expect(proof.approach.weightOnWheels).toBe(false);
    expect(proof.approach.aglFt).toBeGreaterThan(50);

    expect(proof.touchdown.weightOnWheels).toBe(true);
    expect(proof.touchdown.groundContact).toBe('gear');
    expect(proof.touchdown.flightPhase).toBe('LANDED');
    expect(proof.touchdown.touchdownSinkRateMps).toBeGreaterThan(0);

    expect(proof.rollout.groundSpeedKt).toBeLessThan(proof.touchdown.groundSpeedKt);
    expect(['landing-rollout', 'landed']).toContain(proof.rollout.guidancePhase);

    expect(proof.reset.status).toBe('stopped');
    expect(proof.reset.guidancePhase).toBe('preflight');
    expect(proof.reset.weightOnWheels).toBe(true);
    expect(proof.reset.autopilotCleared).toBe(true);
    expect(proof.reset.routeCleared).toBe(true);
  });
});
