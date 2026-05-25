export const FT_TO_M = 0.3048;
export const M_TO_FT = 1 / FT_TO_M;
export const KT_TO_MS = 0.514444;
export const MS_TO_KT = 1 / KT_TO_MS;
export const LBF_TO_N = 4.44822;
export const KG_TO_LB = 2.20462;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const NM_TO_M = 1852;

export const ktToMs = (kt: number) => kt * KT_TO_MS;
export const msToKt = (ms: number) => ms * MS_TO_KT;
export const ftToM = (ft: number) => ft * FT_TO_M;
export const mToFt = (m: number) => m * M_TO_FT;
export const fpmToMs = (fpm: number) => (fpm * FT_TO_M) / 60;
export const msToFpm = (ms: number) => (ms * 60) * M_TO_FT;
export const lbfToN = (lbf: number) => lbf * LBF_TO_N;
export const degToRad = (d: number) => d * DEG_TO_RAD;
export const radToDeg = (r: number) => r * RAD_TO_DEG;
