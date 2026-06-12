import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';
import { flyKseaRouteWithLnav } from './helpers/rfsRoute';

test.describe('RFS route and LNAV browser proof', () => {
  test('KSEA sample route loads, enables LNAV, and decreases DTG while flying', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaRouteWithLnav(page);

    expect(result.initial.routeName).toBe('KSEA→KPDX');
    expect(result.initial.lnavAvailable).toBe(true);
    expect(result.initial.lateralActive).toBe('LNAV');
    expect(result.initial.fmaLateralActive).toBe('LNAV');
    expect(result.final.routeName).toBe('KSEA→KPDX');
    expect(result.final.lnavAvailable).toBe(true);
    expect(result.final.distanceToNextNm).toBeLessThan(result.initial.distanceToNextNm - 0.2);
    expect(result.final.activeLegIndex).toBeGreaterThanOrEqual(result.initial.activeLegIndex);
    for (let i = 1; i < result.samples.length; i += 1) {
      expect(result.samples[i].activeLegIndex).toBeGreaterThanOrEqual(result.samples[i - 1].activeLegIndex);
    }
    expect(result.samples.length).toBeGreaterThan(3);
  });
});
