import type { AircraftState } from '../types';

export function updateElectrical(state: AircraftState, dt: number): void {
  const e = state.electrical;

  e.gen1Online = state.engines[0].running && state.engines[0].n2 > 55;
  e.gen2Online = state.engines[1].running && state.engines[1].n2 > 55;
  e.acBusPowered = e.gen1Online || e.gen2Online;

  if (!e.acBusPowered && e.batteryVolts > 18) {
    e.batteryVolts -= 0.5 * (dt / 60);
  } else if (e.acBusPowered && e.batteryVolts < 28) {
    e.batteryVolts = Math.min(28, e.batteryVolts + 1.0 * (dt / 60));
  }
}
