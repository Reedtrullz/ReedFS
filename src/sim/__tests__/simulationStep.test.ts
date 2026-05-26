import { describe, expect, it } from 'vitest';
import type { ControlInputs } from '../types';
import { B737_800_SPEC, createInitialState } from '../types';
import { buildGuidanceState } from '../guidanceState';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { createNoRouteStatus } from '../systems/navigation';
import { advanceSimulationStep } from '../simulationStep';

function tutorialControls(): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0,
    throttle2: 0,
    flapLever: KSEA_TUTORIAL_SCENARIO.flapSetting,
    gearLever: 'DOWN',
    spoilers: 0,
    brake: 0,
  };
}

describe('advanceSimulationStep', () => {
  it('does not mutate the input aircraft snapshot', () => {
    const aircraft = createInitialState(B737_800_SPEC);
    const pilotInputs = tutorialControls();
    const guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft,
      controls: pilotInputs,
    });
    const before = structuredClone(aircraft);

    const result = advanceSimulationStep({
      aircraft,
      spec: B737_800_SPEC,
      pilotInputs,
      apState: null,
      flightPlan: null,
      activeLegIndex: null,
      routeStatus: createNoRouteStatus(),
      wind: null,
      dt: 1 / 60,
      status: 'running',
      selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
      guidance,
    });

    expect(aircraft).toEqual(before);
    expect(result.aircraft).not.toBe(aircraft);
    expect(result.routeStatus).toEqual(createNoRouteStatus());
    expect(result.activeLegIndex).toBeNull();
    expect(result.controls.inputs).toBe(result.controls.effectiveControls);
  });
});
