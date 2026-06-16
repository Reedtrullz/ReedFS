import { expect, type Page, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';

interface TruthFmaSnapshot {
  thrustActive: string;
  lateralActive: string;
  verticalActive: string;
  autopilotStatus: string;
}

interface TruthSnapshot {
  status: string;
  selectedScenarioId: string;
  flightPlanOrigin: string | null;
  flightPlanDestination: string | null;
  routeName: string;
  lnavAvailable: boolean;
  apStatePresent: boolean;
  fma: TruthFmaSnapshot;
  gearLever: 'UP' | 'DOWN';
  effectiveGearLever: 'UP' | 'DOWN';
  gearDown: boolean;
  weightOnWheels: boolean;
  aglFt: number;
  positiveRate: boolean;
  guidancePhase: string;
  checklistLabels: string[];
}

async function readTruthSnapshot(page: Page): Promise<TruthSnapshot> {
  return page.evaluate(async (): Promise<TruthSnapshot> => {
    const simStoreModule = '/src/store/simStore.ts';
    const fmaTruthModule = '/src/sim/systems/fmaTruth.ts';
    const flightPhasePredicatesModule = '/src/sim/flightPhasePredicates.ts';
    const { useSimStore } = await import(simStoreModule) as {
      useSimStore: { getState: () => {
        status: string;
        selectedScenarioId: string;
        aircraft: { config: { gearDown: boolean }; ground: { weightOnWheels: boolean; aglFt: number } };
        flightPlan: { origin?: string; destination?: string } | null;
        routeStatus: { routeName: string; lnavAvailable: boolean };
        apState: unknown | null;
        inputs: { gearLever: 'UP' | 'DOWN' };
        effectiveControls: { gearLever: 'UP' | 'DOWN' };
        guidance: { phase: string; checklist: Array<{ label: string }> };
      } };
    };
    const { deriveDisplayFmaTruth } = await import(fmaTruthModule) as {
      deriveDisplayFmaTruth: (apState: unknown | null, context: unknown) => TruthFmaSnapshot;
    };
    const { isPositiveRateEstablished } = await import(flightPhasePredicatesModule) as {
      isPositiveRateEstablished: (aircraft: unknown) => boolean;
    };
    const state = useSimStore.getState();
    const fma = deriveDisplayFmaTruth(state.apState, {
      aircraft: state.aircraft,
      flightPlan: state.flightPlan,
      routeStatus: state.routeStatus,
    });

    return {
      status: state.status,
      selectedScenarioId: state.selectedScenarioId,
      flightPlanOrigin: state.flightPlan?.origin ?? null,
      flightPlanDestination: state.flightPlan?.destination ?? null,
      routeName: state.routeStatus.routeName,
      lnavAvailable: state.routeStatus.lnavAvailable,
      apStatePresent: state.apState !== null,
      fma,
      gearLever: state.inputs.gearLever,
      effectiveGearLever: state.effectiveControls.gearLever,
      gearDown: state.aircraft.config.gearDown,
      weightOnWheels: state.aircraft.ground.weightOnWheels,
      aglFt: state.aircraft.ground.aglFt,
      positiveRate: isPositiveRateEstablished(state.aircraft),
      guidancePhase: state.guidance.phase,
      checklistLabels: state.guidance.checklist.map((item) => item.label),
    };
  });
}

function expectFmaOff(snapshot: TruthSnapshot): void {
  expect(snapshot.apStatePresent).toBe(false);
  expect(snapshot.fma.autopilotStatus).toBe('OFF');
  expect(snapshot.fma.lateralActive).toBe('OFF');
  expect(snapshot.fma.verticalActive).toBe('OFF');
  expect(snapshot.fma.thrustActive).toBe('OFF');
}

test.describe('RFS truth-flow browser proof', () => {
  test('LOAD PLAN stays truthful and keyboard gear-up is gated before positive rate', async ({ page }) => {
    test.setTimeout(120_000);
    await openRfs(page);

    await page.getByRole('button', { name: 'LOAD PLAN' }).click();
    await expect(page.getByText(/no default route/i)).toBeVisible();

    const envaSnapshot = await readTruthSnapshot(page);
    expect(envaSnapshot.selectedScenarioId).toBe('enva-tutorial');
    expect(envaSnapshot.flightPlanOrigin).toBeNull();
    expect(envaSnapshot.flightPlanDestination).toBeNull();
    expect(envaSnapshot.routeName).toBe('NO ROUTE');
    expect(envaSnapshot.lnavAvailable).toBe(false);
    expectFmaOff(envaSnapshot);

    await page.getByLabel('Scenario', { exact: true }).selectOption('ksea-tutorial');
    await page.getByRole('button', { name: 'LOAD PLAN' }).click();
    await expect(page.getByText(/no default route/i)).toHaveCount(0);
    await expect(page.getByText('KSEA→KPDX', { exact: true })).toBeVisible();

    const kseaSnapshot = await readTruthSnapshot(page);
    expect(kseaSnapshot.selectedScenarioId).toBe('ksea-tutorial');
    expect(kseaSnapshot.flightPlanOrigin).toBe('KSEA');
    expect(kseaSnapshot.flightPlanDestination).toBe('KPDX');
    expect(kseaSnapshot.routeName).toBe('KSEA→KPDX');
    expect(kseaSnapshot.lnavAvailable).toBe(true);
    expectFmaOff(kseaSnapshot);

    const parkedLnav = page.getByRole('button', { name: /^LNAV$/ });
    await expect(parkedLnav).toBeDisabled();
    await expect(parkedLnav).toHaveAttribute('title', /airborne/i);
    await expect(page.getByLabel('Primary flight display').getByText('LNAV')).toHaveCount(0);

    const stoppedLnavSnapshot = await readTruthSnapshot(page);
    expect(stoppedLnavSnapshot.status).toBe('stopped');
    expect(stoppedLnavSnapshot.weightOnWheels).toBe(true);
    expect(stoppedLnavSnapshot.guidancePhase).toBe('preflight');
    expectFmaOff(stoppedLnavSnapshot);

    await page.getByRole('button', { name: 'START ROLL' }).click();
    await page.keyboard.press('G');

    const gearSnapshot = await readTruthSnapshot(page);
    expect(gearSnapshot.status).toBe('running');
    expect(gearSnapshot.gearLever).toBe('DOWN');
    expect(gearSnapshot.effectiveGearLever).toBe('DOWN');
    expect(gearSnapshot.gearDown).toBe(true);
    expect(gearSnapshot.weightOnWheels).toBe(true);
    expect(gearSnapshot.positiveRate).toBe(false);
    expect(gearSnapshot.guidancePhase).toBe('takeoff-roll');
    expect(gearSnapshot.checklistLabels).not.toContain('Gear up');
    await expect(page.getByRole('status', { name: 'Control feedback' })).toContainText(
      /gear up blocked.*positive rate/i,
    );
    expectFmaOff(gearSnapshot);
  });
});
