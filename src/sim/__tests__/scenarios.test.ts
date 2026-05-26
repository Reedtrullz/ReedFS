import { describe, expect, it } from 'vitest';
import {
  KSEA_LIGHT_PATTERN_SCENARIO,
  KSEA_TUTORIAL_SCENARIO,
  SCENARIOS,
  createAircraftStateForScenario,
} from '../scenarios';
import { B737_800_SPEC, createInitialState } from '../types';
import { updateFuel } from '../systems/fuel';

function scenarioGrossWeight(scenario: typeof KSEA_TUTORIAL_SCENARIO): number {
  return scenario.grossWeightKg;
}

describe('flight scenarios', () => {
  it('defines unique scenario IDs with tutorial runway, trim, and wind context', () => {
    expect(new Set(SCENARIOS.map((scenario) => scenario.id)).size).toBe(SCENARIOS.length);
    expect(KSEA_TUTORIAL_SCENARIO.id).toBe('ksea-tutorial');
    expect(KSEA_TUTORIAL_SCENARIO.runway.elevationFt).toBe(432);
    expect(KSEA_TUTORIAL_SCENARIO.zeroFuelWeightKg).toBe(B737_800_SPEC.emptyWeight + KSEA_TUTORIAL_SCENARIO.payloadWeightKg);
    expect(KSEA_TUTORIAL_SCENARIO.grossWeightKg).toBe(KSEA_TUTORIAL_SCENARIO.zeroFuelWeightKg + KSEA_TUTORIAL_SCENARIO.fuel.totalFuel);
    expect(KSEA_TUTORIAL_SCENARIO.stabilizerTrimUnits).toBeGreaterThan(0);
    expect(KSEA_TUTORIAL_SCENARIO.wind).toEqual(expect.objectContaining({ speed: expect.any(Number) }));
  });

  it('initializes the KSEA tutorial scenario with explicit weight, CG, fuel, and runway state', () => {
    const state = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);

    expect(state.position).toEqual(expect.objectContaining(KSEA_TUTORIAL_SCENARIO.position));
    expect(state.attitude.psi).toBeCloseTo(Math.PI, 9);
    expect(state.config.flapSetting).toBe(KSEA_TUTORIAL_SCENARIO.flapSetting);
    expect(state.config.gearDown).toBe(true);
    expect(state.payloadWeight).toBe(KSEA_TUTORIAL_SCENARIO.payloadWeightKg);
    expect(state.zeroFuelWeight).toBe(KSEA_TUTORIAL_SCENARIO.zeroFuelWeightKg);
    expect(state.fuel.totalFuel).toBe(KSEA_TUTORIAL_SCENARIO.fuel.totalFuel);
    expect(state.grossWeight).toBe(scenarioGrossWeight(KSEA_TUTORIAL_SCENARIO));
    expect(state.cg).toBe(KSEA_TUTORIAL_SCENARIO.cgPercent);
    expect(state.config.stabilizerTrimUnits).toBe(KSEA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    expect(state.ground.groundAltFt).toBe(KSEA_TUTORIAL_SCENARIO.runway.elevationFt);
    expect(state.ground.normalForceN).toBeCloseTo(state.grossWeight * 9.80665, 6);
  });

  it('preserves scenario-authored CG across a no-burn fuel update', () => {
    const state = createAircraftStateForScenario(B737_800_SPEC, KSEA_LIGHT_PATTERN_SCENARIO);

    updateFuel(state, B737_800_SPEC, 1 / 60);

    expect(state.cg).toBe(KSEA_LIGHT_PATTERN_SCENARIO.cgPercent);
    expect(state.grossWeight).toBe(KSEA_LIGHT_PATTERN_SCENARIO.grossWeightKg);
  });

  it('rejects internally inconsistent scenario mass and fuel definitions', () => {
    expect(() => createAircraftStateForScenario(B737_800_SPEC, {
      ...KSEA_TUTORIAL_SCENARIO,
      grossWeightKg: KSEA_TUTORIAL_SCENARIO.grossWeightKg + 1,
    })).toThrow(/gross weight/i);
  });

  it('keeps createInitialState deterministic while allowing scenario overrides', () => {
    const base = createInitialState(B737_800_SPEC);
    const scenario = createAircraftStateForScenario(B737_800_SPEC, KSEA_LIGHT_PATTERN_SCENARIO);

    expect(base.payloadWeight).toBe(0);
    expect(base.fuel.totalFuel).toBe(B737_800_SPEC.maxFuel);
    expect(scenario.payloadWeight).toBe(KSEA_LIGHT_PATTERN_SCENARIO.payloadWeightKg);
    expect(scenario.zeroFuelWeight).toBe(KSEA_LIGHT_PATTERN_SCENARIO.zeroFuelWeightKg);
    expect(scenario.grossWeight).toBe(scenarioGrossWeight(KSEA_LIGHT_PATTERN_SCENARIO));
    expect(scenario.cg).toBe(KSEA_LIGHT_PATTERN_SCENARIO.cgPercent);
  });
});
