import { describe, expect, it } from 'vitest';
import { ENVA_TUTORIAL_SCENARIO, KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO, SCENARIOS } from '../../scenarios';
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

  it('keeps default tutorial and KSEA cards synchronized with scenario configuration', () => {
    const envaCard = findPerformanceCardForScenario(ENVA_TUTORIAL_SCENARIO.id);
    const tutorialCard = findPerformanceCardForScenario(KSEA_TUTORIAL_SCENARIO.id);
    const lightCard = findPerformanceCardForScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);

    expect(() => assertPerformanceCardMatchesScenario(envaCard, ENVA_TUTORIAL_SCENARIO)).not.toThrow();
    expect(() => assertPerformanceCardMatchesScenario(tutorialCard, KSEA_TUTORIAL_SCENARIO)).not.toThrow();
    expect(() => assertPerformanceCardMatchesScenario(lightCard, KSEA_LIGHT_PATTERN_SCENARIO)).not.toThrow();
    expect(envaCard.vSpeeds.v1Kt).toBeLessThanOrEqual(envaCard.vSpeeds.vrKt);
    expect(envaCard.vSpeeds.vrKt).toBeLessThan(envaCard.vSpeeds.v2Kt);
    expect(tutorialCard.vSpeeds.v1Kt).toBeLessThanOrEqual(tutorialCard.vSpeeds.vrKt);
    expect(tutorialCard.vSpeeds.vrKt).toBeLessThan(tutorialCard.vSpeeds.v2Kt);
    expect(lightCard.vSpeeds.vrKt).toBeLessThan(tutorialCard.vSpeeds.vrKt);
  });

  it.each(b737PerformanceCards)('labels $scenarioId performance-card ownership and runtime/test consumers', (card) => {
    expect(card.ownership.label).toBe('runtime-takeoff-cue-and-physics-test-card');
    expect(card.ownership.runtimeConsumers).toContain('src/sim/takeoffCue.ts');
    expect(card.ownership.runtimeConsumers).toContain('src/instruments/RfsPFD.tsx');
    expect(card.ownership.testConsumers).toContain('src/sim/data/__tests__/performanceCards.test.ts');
    expect(card.ownership.sourceNote).toMatch(/not a certified Boeing AFM table/i);
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
