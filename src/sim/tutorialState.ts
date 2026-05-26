import type { FlightScenario, ScenarioTutorialStep } from './scenarios';

export interface TutorialState {
  scenarioId: string;
  stepIndex: number;
  steps: ScenarioTutorialStep[];
}

export function createTutorialState(scenario: FlightScenario): TutorialState {
  return {
    scenarioId: scenario.id,
    stepIndex: 0,
    steps: scenario.tutorialSteps.map((step) => ({ ...step })),
  };
}

export function currentTutorialStep(state: TutorialState): ScenarioTutorialStep | null {
  return state.steps[state.stepIndex] ?? null;
}

export function clampTutorialStepIndex(state: TutorialState, requestedIndex: number): number {
  if (state.steps.length === 0) return 0;
  return Math.min(state.steps.length - 1, Math.max(0, requestedIndex));
}
