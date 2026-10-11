import { create } from 'zustand';

export type BaroUnit = 'hPa' | 'inHg';

export interface BaroSetting {
  mode: 'qnh' | 'std';
  qnhHpa: number;
  unit: BaroUnit;
}

const UNSET_HPA = Number.NaN;

function validQnhHpa(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 880 && value <= 1080;
}

function validUnit(value: unknown): boolean {
  return value === 'hPa' || value === 'inHg';
}

function normalize(next: BaroSetting, prev: BaroSetting): BaroSetting {
  return {
    mode: next.mode === 'std' ? 'std' : 'qnh',
    qnhHpa: validQnhHpa(next.qnhHpa) ? next.qnhHpa : prev.qnhHpa,
    unit: validUnit(next.unit) ? next.unit : prev.unit,
  };
}

export function baroSettingHpa(setting: BaroSetting, fallbackHpa: number): number {
  const qnh = validQnhHpa(setting.qnhHpa) ? setting.qnhHpa : fallbackHpa;
  return setting.mode === 'std' ? 1013.25 : qnh;
}

export const useBaroStore = create<{
  setting: BaroSetting;
  seed: (qnhHpa: number) => void;
  setQnhHpa: (value: number) => boolean;
  setMode: (mode: 'qnh' | 'std') => boolean;
  setUnit: (unit: BaroUnit) => boolean;
}>((set) => ({
  setting: { mode: 'qnh', qnhHpa: UNSET_HPA, unit: 'hPa' },
  seed: (qnhHpa) => set((s) => (validQnhHpa(qnhHpa) && !validQnhHpa(useBaroStore.getState().setting.qnhHpa)
    ? { setting: { ...s.setting, qnhHpa } }
    : s)),
  setQnhHpa: (value) => {
    if (!validQnhHpa(value)) return false;
    set((s) => ({ setting: normalize({ ...s.setting, qnhHpa: value, mode: 'qnh' }, s.setting) }));
    return true;
  },
  setMode: (mode) => {
    if (mode !== 'qnh' && mode !== 'std') return false;
    set((s) => ({ setting: normalize({ ...s.setting, mode }, s.setting) }));
    return true;
  },
  setUnit: (unit) => {
    if (!validUnit(unit)) return false;
    set((s) => ({ setting: { ...s.setting, unit } }));
    return true;
  },
}));
