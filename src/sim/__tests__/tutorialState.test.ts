import { describe, expect, it } from 'vitest';
import { KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { createTutorialState, currentTutorialStep } from '../tutorialState';

describe('tutorialState', () => {
  it('starts each scenario tutorial at its first step', () => {
    const state = createTutorialState(KSEA_TUTORIAL_SCENARIO);

    expect(state.scenarioId).toBe(KSEA_TUTORIAL_SCENARIO.id);
    expect(state.stepIndex).toBe(0);
    expect(currentTutorialStep(state)?.title).toMatch(/line up/i);
  });

  it('keeps tutorial steps scenario-specific', () => {
    const tutorial = createTutorialState(KSEA_TUTORIAL_SCENARIO);
    const pattern = createTutorialState(KSEA_LIGHT_PATTERN_SCENARIO);

    expect(tutorial.steps.map((step) => step.id)).not.toEqual(pattern.steps.map((step) => step.id));
    expect(currentTutorialStep(pattern)?.title).toMatch(/pattern/i);
  });
});
