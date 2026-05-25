import { describe, it, expect } from 'vitest';
import { updateHydraulic } from '../hydraulic';
import { createInitialState, B737_800_SPEC } from '../../types';

describe('updateHydraulic', () => {
  it('System A pressurizes from engine 1 pump', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[0].n2 = 60; s.engines[0].running = true;
    updateHydraulic(s, 2); // 2 seconds
    expect(s.hydraulic.systemAPsi).toBeGreaterThan(1000);
  });

  it('System B pressurizes from engine 2 pump', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[1].n2 = 60; s.engines[1].running = true;
    updateHydraulic(s, 2);
    expect(s.hydraulic.systemBPsi).toBeGreaterThan(1000);
  });

  it('standby system always available with battery', () => {
    const s = createInitialState(B737_800_SPEC);
    s.electrical.batteryVolts = 25;
    updateHydraulic(s, 1);
    expect(s.hydraulic.standbyPsi).toBe(3000);
  });

  it('pressure drops without pumps', () => {
    const s = createInitialState(B737_800_SPEC);
    s.hydraulic.systemAPsi = 3000;
    updateHydraulic(s, 5);
    expect(s.hydraulic.systemAPsi).toBeLessThan(3000);
  });
});
