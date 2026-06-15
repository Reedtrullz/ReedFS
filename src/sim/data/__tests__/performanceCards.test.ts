import { describe, expect, it } from 'vitest';
import { ENVA_TUTORIAL_SCENARIO, KPDX_TUTORIAL_SCENARIO, KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO, SCENARIOS } from '../../scenarios';
import { createKseaKpdxFlight, KSEA_KPDX_APPROACH_CONTRACT } from '../../flightPlanLoader';
import { KPDX_RUNWAY_10R_APPROACH } from '../../../viewport/runwayData';
import {
  assertPerformanceCardMatchesScenario,
  b737PerformanceCards,
  findPerformanceCardForScenario,
} from '../performance/b737PerformanceCards';
import * as b737PerformanceFixtures from '../performance/b737PerformanceCards';

interface FixtureWithOwnership {
  ownership: {
    label: string;
    runtimeConsumers: string[];
    testConsumers: string[];
    sourceNote: string;
  };
}

interface LandingPerformanceCardForTest {
  vrefKt: number;
  targetApproachIasKt: number;
  glidepathDeg: number;
  sinkRateFpm: [number, number];
  touchdownSinkRateMps: [number, number];
  touchdownZoneDistanceM: [number, number];
  stoppingDistanceM: [number, number];
  ownership: {
    label: string;
    runtimeConsumers: string[];
    testConsumers: string[];
    sourceNote: string;
  };
}

interface CardWithLandingForTest {
  scenarioId: string;
  airport: string;
  runway: string;
  approach: { iasKt: number; vrefKt: number };
  landing?: LandingPerformanceCardForTest;
}

const fixtureCollections = [
  ['stall speed', (b737PerformanceFixtures as { b737StallSpeedFixtures?: FixtureWithOwnership[] }).b737StallSpeedFixtures ?? []],
  ['clean climb', (b737PerformanceFixtures as { b737CleanClimbFixtures?: FixtureWithOwnership[] }).b737CleanClimbFixtures ?? []],
  ['cruise trim', (b737PerformanceFixtures as { b737CruiseTrimFixtures?: FixtureWithOwnership[] }).b737CruiseTrimFixtures ?? []],
  ['approach VREF', (b737PerformanceFixtures as { b737ApproachVrefFixtures?: FixtureWithOwnership[] }).b737ApproachVrefFixtures ?? []],
  ['engine lapse', (b737PerformanceFixtures as { b737EngineLapseFixtures?: FixtureWithOwnership[] }).b737EngineLapseFixtures ?? []],
] as const;

describe('B737 performance-card scenario assertions', () => {
  it('defines one takeoff performance card for each playable scenario', () => {
    const cardScenarioIds = b737PerformanceCards.map((card) => card.scenarioId).sort();
    const playableScenarioIds = SCENARIOS.map((scenario) => scenario.id).sort();
    expect(cardScenarioIds).toEqual(playableScenarioIds);
  });

  it('keeps default tutorial, KSEA, and KPDX cards synchronized with scenario configuration', () => {
    const envaCard = findPerformanceCardForScenario(ENVA_TUTORIAL_SCENARIO.id);
    const tutorialCard = findPerformanceCardForScenario(KSEA_TUTORIAL_SCENARIO.id);
    const lightCard = findPerformanceCardForScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    const kpdxCard = findPerformanceCardForScenario(KPDX_TUTORIAL_SCENARIO.id);

    expect(() => assertPerformanceCardMatchesScenario(envaCard, ENVA_TUTORIAL_SCENARIO)).not.toThrow();
    expect(() => assertPerformanceCardMatchesScenario(tutorialCard, KSEA_TUTORIAL_SCENARIO)).not.toThrow();
    expect(() => assertPerformanceCardMatchesScenario(lightCard, KSEA_LIGHT_PATTERN_SCENARIO)).not.toThrow();
    expect(() => assertPerformanceCardMatchesScenario(kpdxCard, KPDX_TUTORIAL_SCENARIO)).not.toThrow();
    expect(envaCard.vSpeeds.v1Kt).toBeLessThanOrEqual(envaCard.vSpeeds.vrKt);
    expect(envaCard.vSpeeds.vrKt).toBeLessThan(envaCard.vSpeeds.v2Kt);
    expect(tutorialCard.vSpeeds.v1Kt).toBeLessThanOrEqual(tutorialCard.vSpeeds.vrKt);
    expect(tutorialCard.vSpeeds.vrKt).toBeLessThan(tutorialCard.vSpeeds.v2Kt);
    expect(lightCard.vSpeeds.vrKt).toBeLessThan(tutorialCard.vSpeeds.vrKt);
    expect(kpdxCard.vSpeeds.vrKt).toBeLessThan(tutorialCard.vSpeeds.vrKt);
  });

  it('keeps KSEA route approach targets aligned with the KPDX runway scenario and performance card', () => {
    const card = findPerformanceCardForScenario(KSEA_KPDX_APPROACH_CONTRACT.destinationScenarioId);
    const route = createKseaKpdxFlight();
    const approach = KPDX_RUNWAY_10R_APPROACH;
    const finalApproach = route.waypoints.find((waypoint) => waypoint.ident === approach.finalApproachFix.ident);
    const threshold = route.waypoints.find((waypoint) => waypoint.ident === approach.threshold.ident);

    expect(route.destination).toBe(KSEA_KPDX_APPROACH_CONTRACT.destinationAirport);
    expect(KPDX_TUTORIAL_SCENARIO.runway.airport).toBe(KSEA_KPDX_APPROACH_CONTRACT.destinationAirport);
    expect(KPDX_TUTORIAL_SCENARIO.runway.runway).toBe(KSEA_KPDX_APPROACH_CONTRACT.runway);
    expect(card.airport).toBe(KSEA_KPDX_APPROACH_CONTRACT.destinationAirport);
    expect(card.runway).toBe(KSEA_KPDX_APPROACH_CONTRACT.runway);
    expect(KPDX_TUTORIAL_SCENARIO.runway.approach?.finalApproachFixIdent).toBe(approach.finalApproachFix.ident);
    expect(KPDX_TUTORIAL_SCENARIO.runway.approach?.thresholdIdent).toBe(approach.threshold.ident);
    expect(threshold?.ident).toBe(KSEA_KPDX_APPROACH_CONTRACT.thresholdIdent);
    expect(threshold?.ident).toMatch(new RegExp(`${card.airport}${card.runway}_RWY`));
    expect(finalApproach?.altitudeConstraint).toEqual({
      type: 'AT',
      altitude: approach.threshold.point.altFt + card.approach.heightAglFt,
    });
    expect(finalApproach?.speedConstraint).toEqual({ type: 'AT_OR_BELOW', speed: card.approach.iasKt });
    expect(threshold?.altitudeConstraint).toEqual({ type: 'AT', altitude: KPDX_TUTORIAL_SCENARIO.runway.elevationFt });
    expect(threshold?.speedConstraint).toEqual({ type: 'AT_OR_BELOW', speed: card.landing.targetApproachIasKt });
  });

  it.each(b737PerformanceCards)('labels $scenarioId performance-card ownership and runtime/test consumers', (card) => {
    expect(card.ownership.label).toBe('runtime-takeoff-cue-and-physics-test-card');
    expect(card.ownership.runtimeConsumers).toContain('src/sim/takeoffCue.ts');
    expect(card.ownership.runtimeConsumers).toContain('src/instruments/RfsPFD.tsx');
    expect(card.ownership.testConsumers).toContain('src/sim/data/__tests__/performanceCards.test.ts');
    expect(card.ownership.sourceNote).toMatch(/not a certified Boeing AFM table/i);
  });

  it.each(b737PerformanceCards)('defines data-owned landing performance bounds for $scenarioId', (card) => {
    const landingCard = (card as CardWithLandingForTest).landing;

    expect(landingCard, `${card.scenarioId} must define landing performance bounds`).toBeDefined();
    expect(landingCard?.vrefKt).toBe(card.approach.vrefKt);
    expect(landingCard?.targetApproachIasKt).toBe(card.approach.iasKt);
    expect(landingCard?.targetApproachIasKt).toBeGreaterThanOrEqual(card.approach.vrefKt);
    expect(landingCard?.targetApproachIasKt).toBeLessThanOrEqual(card.approach.vrefKt + 15);
    expect(landingCard?.glidepathDeg).toBeGreaterThanOrEqual(2.5);
    expect(landingCard?.glidepathDeg).toBeLessThanOrEqual(3.5);
    expect(landingCard?.sinkRateFpm[0]).toBeGreaterThan(0);
    expect(landingCard?.sinkRateFpm[1]).toBeLessThan(1_000);
    expect(landingCard?.touchdownSinkRateMps[0]).toBeGreaterThan(0);
    expect(landingCard?.touchdownSinkRateMps[1]).toBeLessThan(15);
    expect(landingCard?.touchdownZoneDistanceM[0]).toBeGreaterThanOrEqual(0);
    expect(landingCard?.touchdownZoneDistanceM[1]).toBeLessThanOrEqual(900);
    expect(landingCard?.stoppingDistanceM[0]).toBeGreaterThan(0);
    expect(landingCard?.stoppingDistanceM[1]).toBeGreaterThan(landingCard?.stoppingDistanceM[0] ?? 0);
    expect(landingCard?.ownership.label).toBe('runtime-landing-proof-and-performance-test-card');
    expect(landingCard?.ownership.testConsumers).toContain('src/sim/data/__tests__/performanceCards.test.ts');
    expect(landingCard?.ownership.sourceNote).toMatch(/not a certified Boeing AFM table/i);
  });

  it.each(fixtureCollections)('labels %s fixture ownership as placeholder-only, non-AFM data', (_label, fixtures) => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) {
      expect(fixture.ownership.label).toBe('placeholder-performance-envelope-fixture');
      expect(fixture.ownership.runtimeConsumers).toEqual([]);
      expect(fixture.ownership.testConsumers.length).toBeGreaterThan(0);
      expect(fixture.ownership.sourceNote).toMatch(/not certified/i);
      expect(fixture.ownership.sourceNote).toMatch(/not an? AFM/i);
    }
  });

  it('rejects a stale card when the scenario weight or configuration drifts', () => {
    const tutorialCard = findPerformanceCardForScenario(KSEA_TUTORIAL_SCENARIO.id);

    expect(() => assertPerformanceCardMatchesScenario(
      { ...tutorialCard, grossWeightKg: tutorialCard.grossWeightKg + 1 },
      KSEA_TUTORIAL_SCENARIO,
    )).toThrow(/gross weight/i);
  });
});
