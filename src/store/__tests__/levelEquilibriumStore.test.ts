import { describe, expect, it } from 'vitest';
import { LEVEL_EQUILIBRIUM_ENGINEERING_SCENARIO } from '../../sim/scenarios';
import { ENVA_TUTORIAL_SCENARIO } from '../../sim/scenarios';
import { useSimStore } from '../simStore';
import { levelEquilibriumReceiptForScenario } from '../levelEquilibrium';

describe('level-equilibrium scenario store integration', () => {
  it('reset and setScenario produce identical level-equilibrium initialization', () => {
    useSimStore.getState().setScenario(LEVEL_EQUILIBRIUM_ENGINEERING_SCENARIO.id);
    const viaSetScenario = useSimStore.getState();

    useSimStore.getState().reset();
    const viaReset = useSimStore.getState();

    expect(viaSetScenario.selectedScenarioId).toBe(viaReset.selectedScenarioId);
    expect(viaSetScenario.aircraft).toEqual(viaReset.aircraft);
    expect(viaSetScenario.pilotInputs).toEqual(viaReset.pilotInputs);
    expect(viaSetScenario.inputs).toEqual(viaReset.inputs);
    expect(viaSetScenario.effectiveControls).toEqual(viaReset.effectiveControls);
    expect(viaSetScenario.inputManager).toEqual(viaReset.inputManager);
    expect(viaSetScenario.levelEquilibriumReceipt).toEqual(viaReset.levelEquilibriumReceipt);
    expect(viaSetScenario.guidance.scenarioId).toBe(viaReset.guidance.scenarioId);
  });

  it('initializes the solved equilibrium state with receipt provenance', () => {
    useSimStore.getState().setScenario(LEVEL_EQUILIBRIUM_ENGINEERING_SCENARIO.id);
    const state = useSimStore.getState();
    const receipt = levelEquilibriumReceiptForScenario(LEVEL_EQUILIBRIUM_ENGINEERING_SCENARIO);

    expect(state.levelEquilibriumReceipt).toEqual(receipt);
    expect(receipt?.status).toBe('converged');
    expect(state.inputs.throttle1).toBe(receipt?.solvedThrottle);
    expect(state.inputs.throttle2).toBe(receipt?.solvedThrottle);
    expect(state.inputs.gearLever).toBe('UP');
    expect(state.aircraft.config.gearDown).toBe(false);
    expect(state.aircraft.config.stabilizerTrimUnits).toBe(receipt?.solvedTrimUnits);
    expect(state.aircraft.attitude.theta).toBeCloseTo((receipt?.solvedPitchDeg ?? 0) * Math.PI / 180, 12);
  });

  it('keeps authored scenarios on authored initialization with a null receipt', () => {
    useSimStore.getState().setScenario(ENVA_TUTORIAL_SCENARIO.id);
    useSimStore.getState().reset();
    expect(useSimStore.getState().levelEquilibriumReceipt).toBeNull();
  });
});
