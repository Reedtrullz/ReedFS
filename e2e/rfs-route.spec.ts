import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';
import {
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
});
