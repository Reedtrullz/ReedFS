import type { AircraftState } from '../types';

export function updateHydraulic(
  state: AircraftState,
  dt: number,
  pumps?: { aOn?: boolean; bOn?: boolean; standbyOn?: boolean },
): void {
  const h = state.hydraulic;

  const engine1Drive = state.engines[0].running && state.engines[0].n2 > 30;
  const engine2Drive = state.engines[1].running && state.engines[1].n2 > 30;
  const electricPower = state.electrical.dcBusPowered;
  // Commands come from the control layer when provided; omitted commands fall
  // back to the current engine-driven behavior so legacy callers stay valid.
  const aOn = pumps ? pumps.aOn === true && engine1Drive : engine1Drive;
  const bOn = pumps ? pumps.bOn === true && engine2Drive : engine2Drive;
  const standbyOn = pumps ? pumps.standbyOn === true && electricPower : electricPower;

  // Exponential approach is only stable for dt <= tau; clamp so a large frame
  // step converges instead of overshooting past the 3000 psi relief setting.
  const approach = Math.min(1, dt / 0.5);
  // System A: engine 1 pump
  const aTarget = aOn ? 3000 : 0;
  h.systemAPsi += (aTarget - h.systemAPsi) * approach;

  // System B: engine 2 pump
  const bTarget = bOn ? 3000 : 0;
  h.systemBPsi += (bTarget - h.systemBPsi) * approach;

  const standbyTarget = standbyOn && state.electrical.batteryVolts > 20 ? 3000 : 0;
  h.standbyPsi += (standbyTarget - h.standbyPsi) * approach;
}
