import { create } from 'zustand';

export type BaroUnit = 'hPa' | 'inHg';

export interface BaroSetting {
  mode: 'qnh' | 'std';
  qnhHpa: number;
  unit: BaroUnit;
}

const UNSET_HPA = Number.NaN;
const HPA_MIN = 880;
const HPA_MAX = 1080;

function validQnhHpa(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= HPA_MIN && value <= HPA_MAX;
}

export function baroSettingHpa(setting: BaroSetting, fallbackHpa: number): number {
  return setting.mode === 'std' ? 1013.25 : validQnhHpa(setting.qnhHpa) ? setting.qnhHpa : fallbackHpa;
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
    set((s) => ({ setting: { ...s.setting, qnhHpa: value, mode: 'qnh' } }));
    return true;
  },
  setMode: (mode) => {
    if (mode !== 'qnh' && mode !== 'std') return false;
    set((s) => ({ setting: { ...s.setting, mode } }));
    return true;
  },
  setUnit: (unit) => {
    if (unit !== 'hPa' && unit !== 'inHg') return false;
    set((s) => ({ setting: { ...s.setting, unit } }));
    return true;
  },
}));
