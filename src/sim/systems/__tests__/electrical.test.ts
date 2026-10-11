import { describe, it, expect } from 'vitest';
import { updateElectrical } from '../electrical';
import { updateHydraulic } from '../hydraulic';
import { createInitialState, B737_800_SPEC } from '../../types';

function runningState(): ReturnType<typeof createInitialState> {
  const s = createInitialState(B737_800_SPEC);
  s.engines[0].n2 = 60; s.engines[0].running = true;
  s.engines[1].n2 = 60; s.engines[1].running = true;
  updateElectrical(s, 1);
  return s;
}

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

describe('power distribution truth (#76 first increment)', () => {
  it('dc bus stays powered by the battery when both generators fail', () => {
    const s = createInitialState(B737_800_SPEC);
    updateElectrical(s, 1);
    expect(s.electrical.acBusPowered).toBe(false);
    expect(s.electrical.dcBusPowered).toBe(true);
    expect(s.electrical.hotBatteryBusPowered).toBe(true);
  });

  it('engine-driven pumps pressurize their systems without explicit commands', () => {
    const s = runningState();
    updateHydraulic(s, 0.5);
    expect(s.hydraulic.systemAPsi).toBeGreaterThan(2000);
    expect(s.hydraulic.systemBPsi).toBeGreaterThan(2000);
    expect(s.hydraulic.standbyPsi).toBeGreaterThan(2000);
  });

  it('both engines failed leaves zero pressure with pumps uncommanded', () => {
    const s = createInitialState(B737_800_SPEC);
    s.hydraulic.systemAPsi = 3000;
    s.hydraulic.systemBPsi = 3000;
    updateHydraulic(s, 0.5);
    expect(s.hydraulic.systemAPsi).toBeLessThan(100);
    expect(s.hydraulic.systemBPsi).toBeLessThan(100);
    expect(s.hydraulic.standbyPsi).toBeGreaterThan(2000);
  });

  it('standby pump uncommanded loses pressure even on battery power', () => {
    const s = createInitialState(B737_800_SPEC);
    s.hydraulic.standbyPsi = 3000;
    updateHydraulic(s, 0.5, { aOn: false, bOn: false, standbyOn: false });
    expect(s.hydraulic.standbyPsi).toBeLessThan(100);
  });

  it('commanded pumps stay subject to their power source', () => {
    const s = createInitialState(B737_800_SPEC);
    updateHydraulic(s, 0.5, { aOn: true, bOn: true, standbyOn: true });
    expect(s.hydraulic.systemAPsi).toBe(0);
    expect(s.hydraulic.systemBPsi).toBe(0);
    expect(s.hydraulic.standbyPsi).toBeGreaterThan(2000);
  });
});

