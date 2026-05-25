import type { AircraftState } from '../types';

export function updateHydraulic(state: AircraftState, dt: number): void {
  const h = state.hydraulic;

  // System A: engine 1 pump
  const aTarget = (state.engines[0].running && state.engines[0].n2 > 30) ? 3000 : 0;
  h.systemAPsi += (aTarget - h.systemAPsi) * (dt / 0.5);

  // System B: engine 2 pump
  const bTarget = (state.engines[1].running && state.engines[1].n2 > 30) ? 3000 : 0;
  h.systemBPsi += (bTarget - h.systemBPsi) * (dt / 0.5);

  // Standby: electric pump, available if battery > 20V
  h.standbyPsi = state.electrical.batteryVolts > 20 ? 3000 : 0;
}
