import type { AircraftState, AircraftSpec } from '../types';

export function updateFuel(
  state: AircraftState,
  spec: AircraftSpec,
  dt: number,
): void {
  let remaining = (state.fuel.fuelFlowTotal / 3600) * dt;

  // Burn center tank first
  const fromCenter = Math.min(remaining, state.fuel.centerTank);
  state.fuel.centerTank -= fromCenter;
  remaining -= fromCenter;

  // Burn wing tanks equally
  const perWing = Math.min(remaining / 2, state.fuel.leftTank, state.fuel.rightTank);
  state.fuel.leftTank -= perWing;
  state.fuel.rightTank -= perWing;

  state.fuel.totalFuel = state.fuel.centerTank + state.fuel.leftTank + state.fuel.rightTank;
  state.zeroFuelWeight = spec.emptyWeight + state.payloadWeight;
  state.grossWeight = state.zeroFuelWeight + state.fuel.totalFuel;

  // CG shift: center tank arm = 22% MAC, wings = 30% MAC, empty aircraft = 25% MAC
  if (state.fuel.totalFuel > 0 || state.payloadWeight > 0) {
    const cgCenter = 22, cgWing = 30;
    const totalMass = state.zeroFuelWeight + state.fuel.totalFuel;
    state.cg = (
      state.zeroFuelWeight * state.zeroFuelCg +
      state.fuel.centerTank * cgCenter +
      (state.fuel.leftTank + state.fuel.rightTank) * cgWing
    ) / totalMass;
  }
}
