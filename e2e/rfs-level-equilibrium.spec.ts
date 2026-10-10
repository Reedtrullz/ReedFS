import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';

// Solver receipt, reset parity, and unassisted equilibrium hold in the real app.
// Thresholds are declared here and never retuned to force admission.
test('level-equilibrium scenario initializes solved and holds altitude unassisted', async ({ page }) => {
  test.setTimeout(120_000);
  const EQUILIBRIUM_HOLD_SECONDS = 10;
  const MAX_ALTITUDE_DRIFT_FT = 10;
  const MAX_TAS_DRIFT_KT = 1;
  const MAX_PITCH_DRIFT_DEG = 0.2;

  await openRfs(page);

  await expect(page.locator('#scenario-picker')).toBeVisible();
  await page.locator('#scenario-picker').selectOption({ label: 'Level Equilibrium Engineering' });

  const receipt = page.getByTestId('level-equilibrium-receipt');
  await expect(receipt).toContainText('Level equilibrium solved');
  await expect(receipt).toContainText('Target 220 kt TAS');

  const stateBefore = await page.evaluate(async () => {
    const path = '/src/store/simStore.ts';
    const { useSimStore } = await import(/* @vite-ignore */ path);
    const s = useSimStore.getState();
    return {
      alt: s.aircraft.position.alt,
      tasKt: Math.hypot(s.aircraft.velocity.u, s.aircraft.velocity.v, s.aircraft.velocity.w) * 1.94384,
      pitchDeg: (s.aircraft.attitude.theta * 180) / Math.PI,
      receipt: s.levelEquilibriumReceipt,
    };
  });

  expect(stateBefore.receipt?.status).toBe('converged');
  expect(Math.abs(stateBefore.alt - 10_022)).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: /START ROLL|RESUME|START/i }).click();
  await page.waitForTimeout(EQUILIBRIUM_HOLD_SECONDS * 1000);

  const stateAfter = await page.evaluate(async () => {
    const path = '/src/store/simStore.ts';
    const { useSimStore } = await import(/* @vite-ignore */ path);
    const s = useSimStore.getState();
    return {
      alt: s.aircraft.position.alt,
      tasKt: Math.hypot(s.aircraft.velocity.u, s.aircraft.velocity.v, s.aircraft.velocity.w) * 1.94384,
      pitchDeg: (s.aircraft.attitude.theta * 180) / Math.PI,
      status: s.status,
    };
  });

  expect(stateAfter.status).toBe('running');
  expect(Math.abs(stateAfter.alt - stateBefore.alt)).toBeLessThanOrEqual(MAX_ALTITUDE_DRIFT_FT);
  expect(Math.abs(stateAfter.tasKt - stateBefore.tasKt)).toBeLessThanOrEqual(MAX_TAS_DRIFT_KT);
  expect(Math.abs(stateAfter.pitchDeg - stateBefore.pitchDeg)).toBeLessThanOrEqual(MAX_PITCH_DRIFT_DEG);
});
