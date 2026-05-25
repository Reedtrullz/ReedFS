import { describe, it, expect } from 'vitest';
import { updateElectrical } from '../electrical';
import { createInitialState, B737_800_SPEC } from '../../types';

describe('updateElectrical', () => {
  it('generators online when N2 > 55%', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[0].n2 = 60; s.engines[0].running = true;
    s.engines[1].n2 = 60; s.engines[1].running = true;
    updateElectrical(s, 1);
    expect(s.electrical.gen1Online).toBe(true);
    expect(s.electrical.gen2Online).toBe(true);
    expect(s.electrical.acBusPowered).toBe(true);
  });

  it('generators offline when engines low N2', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[0].n2 = 30; s.engines[0].running = true;
    s.engines[1].n2 = 30; s.engines[1].running = true;
    updateElectrical(s, 1);
    expect(s.electrical.gen1Online).toBe(false);
    expect(s.electrical.acBusPowered).toBe(false);
  });

  it('battery depletes without generators', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.electrical.batteryVolts).toBe(28);
    updateElectrical(s, 120); // 2 minutes
    expect(s.electrical.batteryVolts).toBeLessThan(28);
  });

  it('battery recharges with generators', () => {
    const s = createInitialState(B737_800_SPEC);
    s.electrical.batteryVolts = 24;
    s.engines[0].n2 = 60; s.engines[0].running = true;
    s.engines[1].n2 = 60; s.engines[1].running = true;
    updateElectrical(s, 60); // 1 minute
    expect(s.electrical.batteryVolts).toBeGreaterThan(24);
  });
});
