import { expect, test } from '@playwright/test';
import { findPerformanceCardForScenario, type B737LandingPerformanceEnvelope } from '../src/sim/data/performance/b737PerformanceCards';
import { openRfs, startRoll } from './helpers/rfsPage';
import {
  flyApproachToLandingRolloutAndReset,
  flyDescentApproachToLandingRolloutAndReset,
  flyEnvaTakeoffToCleanClimb,
  flyKpdxShortFinalToLandingRolloutAndReset,
} from './helpers/rfsFlight';

const EXPECTED_LANDING_PHASES = ['TOUCHDOWN', 'DEROTATION', 'ROLLOUT', 'STOPPED'];
const ROLLOUT_GUIDANCE_PHASES = ['landing-rollout', 'taxi', 'stopped'];
const ENVA_LANDING_CARD = findPerformanceCardForScenario('enva-tutorial').landing;
const KPDX_LANDING_CARD = findPerformanceCardForScenario('kpdx-tutorial').landing;

interface LandingPerformanceProofSnapshot {
  iasKt: number;
  verticalSpeedFpm: number;
  touchdownSinkRateMps: number;
  runwayAlongTrackM?: number;
}

interface LandingPerformanceProof {
  touchdown: LandingPerformanceProofSnapshot;
  rollout: LandingPerformanceProofSnapshot;
}

function expectRange(value: number | undefined, range: [number, number], label: string): void {
  expect(value, `${label} must be recorded`).toBeDefined();
  expect(value, `${label} below ${range[0]}`).toBeGreaterThanOrEqual(range[0]);
  expect(value, `${label} above ${range[1]}`).toBeLessThanOrEqual(range[1]);
}

function expectLandingPerformanceWithinCard(proof: LandingPerformanceProof, card: B737LandingPerformanceEnvelope): void {
  const touchdownIasMeasurementToleranceKt = 1;
  expectRange(
    proof.touchdown.iasKt,
    [card.vrefKt - touchdownIasMeasurementToleranceKt, card.targetApproachIasKt + 15],
    'touchdown IAS',
  );
  expectRange(proof.touchdown.touchdownSinkRateMps, card.touchdownSinkRateMps, 'touchdown sink rate');
  expectRange(proof.touchdown.runwayAlongTrackM, card.touchdownZoneDistanceM, 'touchdown-zone distance');
  expectRange(
    (proof.rollout.runwayAlongTrackM ?? Number.NaN) - (proof.touchdown.runwayAlongTrackM ?? Number.NaN),
    card.stoppingDistanceM,
    'stopping distance',
  );
}

function expectExplicitLandingSequence(phases: string[]): void {
  expect(phases).toEqual(expect.arrayContaining(EXPECTED_LANDING_PHASES));
  expect(phases).not.toContain('LANDED');
  expect(phases.indexOf('TOUCHDOWN')).toBeLessThan(phases.indexOf('DEROTATION'));
  expect(phases.indexOf('DEROTATION')).toBeLessThan(phases.indexOf('ROLLOUT'));
  expect(phases.indexOf('ROLLOUT')).toBeLessThan(phases.indexOf('STOPPED'));
}

async function expectWorkerRuntimeWhenFlagged(page: Parameters<typeof openRfs>[0]): Promise<void> {
  if (process.env.VITE_RFS_WORKER_PHYSICS !== '1') return;

  const runtimeKind = await page.evaluate(async () => {
    const mod = await import('/src/sim/simulationRuntime.ts');
    return mod.getSimulationRuntime().kind;
  });

  expect(runtimeKind).toBe('browser-worker');
}

test.describe('RFS playable flight loops', () => {
  test('ENVA tutorial reaches clean climb with phase-aware guidance', async ({ page }) => {
    await openRfs(page);
    await expectWorkerRuntimeWhenFlagged(page);
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
    expectLandingPerformanceWithinCard(proof, ENVA_LANDING_CARD);

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
    expect(proof.descent.guidancePhase).toBe('descent');
    expect(proof.descent.weightOnWheels).toBe(false);
    expect(proof.descent.aglFt).toBeGreaterThan(300);
    expect(proof.descent.autopilotCleared).toBe(true);
    expect(proof.descent.routeCleared).toBe(true);

    expect(proof.configuredApproach.gearDown).toBe(true);
    expect(proof.configuredApproach.flightPhase).toBe('APPROACH');
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
    expect(proof.touchdown.surfaceRunwayId).toBe('10R');
    expect(proof.touchdown.touchdownSinkRateMps).toBeGreaterThan(0);
    expect(proof.touchdown.touchdownSinkRateMps).toBeLessThan(15);

    expect(proof.rollout.groundSpeedKt).toBeLessThan(proof.touchdown.groundSpeedKt);
    expect(ROLLOUT_GUIDANCE_PHASES).toContain(proof.rollout.guidancePhase);
    expectExplicitLandingSequence(proof.landingPhases);
    expectLandingPerformanceWithinCard(proof, KPDX_LANDING_CARD);

    expect(proof.reset.status).toBe('stopped');
    expect(proof.reset.guidancePhase).toBe('preflight');
    expect(proof.reset.weightOnWheels).toBe(true);
    expect(proof.reset.autopilotCleared).toBe(true);
    expect(proof.reset.routeCleared).toBe(true);
  });
});
