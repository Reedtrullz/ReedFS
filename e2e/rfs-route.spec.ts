import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';
import { flyKseaRouteWithLnav } from './helpers/rfsRoute';

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
});
