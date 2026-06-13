import { describe, it, expect } from 'vitest';
import { updateFuel } from '../fuel';
import { createInitialState, B737_800_SPEC } from '../../types';
import { createAircraftStateForScenario, KSEA_TUTORIAL_SCENARIO } from '../../scenarios';

describe('updateFuel', () => {
  it('burns center tank first', () => {
    const s = createInitialState(B737_800_SPEC);
    s.fuel.fuelFlowTotal = 10000; // kg/hr
    updateFuel(s, B737_800_SPEC, 1/3600); // 1 second
    expect(s.fuel.centerTank).toBeLessThan(B737_800_SPEC.fuelCapacity.center);
    expect(s.fuel.leftTank).toBe(B737_800_SPEC.fuelCapacity.left);
    expect(s.fuel.rightTank).toBe(B737_800_SPEC.fuelCapacity.right);
  });

  it('burns wing tanks after center is empty', () => {
    const s = createInitialState(B737_800_SPEC);
    s.fuel.centerTank = 0;
    s.fuel.leftTank = 3914;
    s.fuel.rightTank = 3914;
    s.fuel.totalFuel = 7828;
    s.fuel.fuelFlowTotal = 10000;
    updateFuel(s, B737_800_SPEC, 1); // 1 hour at 10000 kg/hr
    expect(s.fuel.leftTank).toBeLessThan(3914);
    expect(s.fuel.rightTank).toBeLessThan(3914);
    // wings should drain roughly equally
    expect(Math.abs(s.fuel.leftTank - s.fuel.rightTank)).toBeLessThan(10);
  });

  it('updates totalFuel and grossWeight', () => {
    const s = createInitialState(B737_800_SPEC);
    const before = s.fuel.totalFuel;
    s.fuel.fuelFlowTotal = 5000;
    updateFuel(s, B737_800_SPEC, 1/3600);
    expect(s.fuel.totalFuel).toBeLessThan(before);
  });

  it('stops reported fuel flow when all tanks are dry', () => {
    const s = createInitialState(B737_800_SPEC);
    s.fuel = { centerTank: 0, leftTank: 0, rightTank: 0, totalFuel: 0, fuelFlowTotal: 8_000 };
    s.engines[0] = { ...s.engines[0], fuelFlow: 4_000, thrust: 20_000, running: true };
    s.engines[1] = { ...s.engines[1], fuelFlow: 4_000, thrust: 20_000, running: true };

    updateFuel(s, B737_800_SPEC, 1);

    expect(s.fuel.totalFuel).toBe(0);
    expect(s.fuel.fuelFlowTotal).toBe(0);
    expect(s.engines[0].fuelFlow).toBe(0);
    expect(s.engines[0].thrust).toBe(0);
    expect(s.engines[0].running).toBe(false);
  });

  it('clamps reported fuel flow to fuel actually available during a starvation tick', () => {
    const s = createInitialState(B737_800_SPEC);
    s.fuel = { centerTank: 0, leftTank: 0.25, rightTank: 0.25, totalFuel: 0.5, fuelFlowTotal: 7_200 };
    s.engines[0] = { ...s.engines[0], fuelFlow: 3_600, thrust: 20_000, running: true };
    s.engines[1] = { ...s.engines[1], fuelFlow: 3_600, thrust: 20_000, running: true };

    updateFuel(s, B737_800_SPEC, 1);

    expect(s.fuel.totalFuel).toBe(0);
    expect(s.fuel.fuelFlowTotal).toBeCloseTo(1_800, 6);
    expect(s.engines[0].fuelFlow).toBeCloseTo(900, 6);
    expect(s.engines[1].fuelFlow).toBeCloseTo(900, 6);
  });

  it('preserves payload mass in grossWeight when fuel burns', () => {
    const s = createInitialState(B737_800_SPEC);
    s.payloadWeight = 12000;
    s.fuel.fuelFlowTotal = 3600;

    updateFuel(s, B737_800_SPEC, 1);

    expect(s.grossWeight).toBeCloseTo(B737_800_SPEC.emptyWeight + s.payloadWeight + s.fuel.totalFuel, 6);
  });

  it('uses scenario zero-fuel CG when recomputing fuel-weighted CG', () => {
    const state = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);

    updateFuel(state, B737_800_SPEC, 0);

    expect(state.zeroFuelCg).not.toBeCloseTo(25, 6);
    expect(state.cg).toBeCloseTo(KSEA_TUTORIAL_SCENARIO.cgPercent, 6);
  });

  it('clamps recomputed CG to aircraft limits', () => {
    const state = createInitialState(B737_800_SPEC);
    state.zeroFuelCg = 99;
    state.fuel = { totalFuel: 0, fuelFlowTotal: 0, centerTank: 0, leftTank: 0, rightTank: 0 };

    updateFuel(state, B737_800_SPEC, 0);

    expect(state.cg).toBe(B737_800_SPEC.cgLimits[1]);
  });
});
