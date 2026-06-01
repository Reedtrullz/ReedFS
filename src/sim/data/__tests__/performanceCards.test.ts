import { describe, expect, it } from 'vitest';
import { KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO, SCENARIOS } from '../../scenarios';
import {
  assertPerformanceCardMatchesScenario,
  b737PerformanceCards,
  findPerformanceCardForScenario,
} from '../performance/b737PerformanceCards';

describe('B737 performance-card scenario assertions', () => {
  it('defines one takeoff performance card for each playable scenario', () => {
    // Only KSEA scenarios have performance cards currently.
    const cardScenarioIds = b737PerformanceCards.map((card) => card.scenarioId).sort();
    const kseaScenarioIds = SCENARIOS.filter((s) => s.id.startsWith('ksea')).map((s) => s.id).sort();
    expect(cardScenarioIds).toEqual(kseaScenarioIds);
  });

  it('keeps tutorial and light-pattern cards synchronized with scenario configuration', () => {
    const tutorialCard = findPerformanceCardForScenario(KSEA_TUTORIAL_SCENARIO.id);
    const lightCard = findPerformanceCardForScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);

    expect(() => assertPerformanceCardMatchesScenario(tutorialCard, KSEA_TUTORIAL_SCENARIO)).not.toThrow();
    expect(() => assertPerformanceCardMatchesScenario(lightCard, KSEA_LIGHT_PATTERN_SCENARIO)).not.toThrow();
    expect(tutorialCard.vSpeeds.v1Kt).toBeLessThanOrEqual(tutorialCard.vSpeeds.vrKt);
    expect(tutorialCard.vSpeeds.vrKt).toBeLessThan(tutorialCard.vSpeeds.v2Kt);
    expect(lightCard.vSpeeds.vrKt).toBeLessThan(tutorialCard.vSpeeds.vrKt);
  });

  it('rejects a stale card when the scenario weight or configuration drifts', () => {
    const tutorialCard = findPerformanceCardForScenario(KSEA_TUTORIAL_SCENARIO.id);

    expect(() => assertPerformanceCardMatchesScenario(
      { ...tutorialCard, grossWeightKg: tutorialCard.grossWeightKg + 1 },
      KSEA_TUTORIAL_SCENARIO,
    )).toThrow(/gross weight/i);
  });
});
