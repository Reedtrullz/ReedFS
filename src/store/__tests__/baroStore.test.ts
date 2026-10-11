import { beforeEach, describe, expect, it } from 'vitest';
import { baroSettingHpa, useBaroStore, type BaroSetting } from '../baroStore';

const BASE: BaroSetting = { mode: 'qnh', qnhHpa: 1013.25, unit: 'hPa' };

describe('baroStore', () => {
  beforeEach(() => {
    useBaroStore.setState({ setting: { ...BASE } });
  });

  it('hPa/inHg conversion changes display but not the stored datum', () => {
    useBaroStore.getState().setUnit('inHg');
    expect(useBaroStore.getState().setting.unit).toBe('inHg');
    expect(useBaroStore.getState().setting.qnhHpa).toBe(1013.25);
    expect(baroSettingHpa(useBaroStore.getState().setting, 1000)).toBe(1013.25);
  });

  it('setQnhHpa moves the knob and back to qnh mode without weather side effects', () => {
    expect(useBaroStore.getState().setQnhHpa(1003)).toBe(true);
    expect(useBaroStore.getState().setting.mode).toBe('qnh');
    expect(useBaroStore.getState().setting.qnhHpa).toBe(1003);
    expect(baroSettingHpa(useBaroStore.getState().setting, 9999)).toBe(1003);
  });

  it('STD mode is reversible and uses 1013.25 while preserving the knob value', () => {
    useBaroStore.getState().setQnhHpa(990);
    useBaroStore.getState().setMode('std');
    expect(baroSettingHpa(useBaroStore.getState().setting, 990)).toBe(1013.25);
    useBaroStore.getState().setMode('qnh');
    expect(useBaroStore.getState().setting.qnhHpa).toBe(990);
  });

  it('rejects invalid settings without changing the datum', () => {
    expect(useBaroStore.getState().setQnhHpa(500)).toBe(false);
    expect(useBaroStore.getState().setQnhHpa(Number.NaN)).toBe(false);
    expect(useBaroStore.getState().setMode('bogus' as 'qnh')).toBe(false);
    expect(useBaroStore.getState().setUnit('kPa' as 'hPa')).toBe(false);
    expect(useBaroStore.getState().setting).toEqual(BASE);
  });

  it('starts unset and falls back until seeded', () => {
    useBaroStore.setState({ setting: { mode: 'qnh', qnhHpa: Number.NaN, unit: 'hPa' } });
    expect(baroSettingHpa(useBaroStore.getState().setting, 1009)).toBe(1009);
    useBaroStore.getState().seed(1004);
    expect(baroSettingHpa(useBaroStore.getState().setting, 1009)).toBe(1004);
  });

  it('seeds exactly once until the first explicit knob change', () => {
    useBaroStore.setState({ setting: { mode: 'qnh', qnhHpa: Number.NaN, unit: 'hPa' } });
    useBaroStore.getState().seed(1004);
    expect(useBaroStore.getState().setting.qnhHpa).toBe(1004);
    useBaroStore.getState().seed(1013);
    expect(useBaroStore.getState().setting.qnhHpa).toBe(1004);
    useBaroStore.getState().setQnhHpa(1003);
    useBaroStore.getState().seed(1010);
    expect(useBaroStore.getState().setting.qnhHpa).toBe(1003);
  });
});
