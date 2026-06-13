import type { AircraftState, AircraftSpec } from '../types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function updateFuel(
  state: AircraftState,
  spec: AircraftSpec,
  dt: number,
): void {
  const requestedFlowKgPerHour = Math.max(0, state.fuel.fuelFlowTotal);
  const requestedBurnKg = dt > 0 ? (requestedFlowKgPerHour / 3600) * dt : 0;
  const fuelBeforeKg = Math.max(0, state.fuel.centerTank) + Math.max(0, state.fuel.leftTank) + Math.max(0, state.fuel.rightTank);
  let remaining = Math.min(requestedBurnKg, fuelBeforeKg);

  // Burn center tank first
  const fromCenter = Math.min(remaining, state.fuel.centerTank);
  state.fuel.centerTank -= fromCenter;
  remaining -= fromCenter;

  // Burn wing tanks equally while both have fuel.
  const perWing = Math.min(remaining / 2, state.fuel.leftTank, state.fuel.rightTank);
  state.fuel.leftTank -= perWing;
  state.fuel.rightTank -= perWing;
  remaining -= perWing * 2;

  // If one wing is depleted in an edge-case starvation tick, consume any remaining
  // requested fuel from the other tank without letting either tank go negative.
  if (remaining > 0) {
    const fromLeft = Math.min(remaining, state.fuel.leftTank);
    state.fuel.leftTank -= fromLeft;
    remaining -= fromLeft;
  }
  if (remaining > 0) {
    const fromRight = Math.min(remaining, state.fuel.rightTank);
    state.fuel.rightTank -= fromRight;
  }

  state.fuel.totalFuel = state.fuel.centerTank + state.fuel.leftTank + state.fuel.rightTank;
  const actualBurnKg = Math.max(0, fuelBeforeKg - state.fuel.totalFuel);
  const flowScale = requestedBurnKg > 0 ? clamp(actualBurnKg / requestedBurnKg, 0, 1) : 1;
  if (requestedBurnKg > 0 && flowScale < 1) {
    state.fuel.fuelFlowTotal = requestedFlowKgPerHour * flowScale;
    for (const engine of state.engines) {
      engine.fuelFlow *= flowScale;
      engine.thrust *= flowScale;
      if (flowScale === 0) engine.running = false;
    }
  }
  if (state.fuel.totalFuel <= 1e-9 && actualBurnKg === 0 && requestedFlowKgPerHour > 0) {
    state.fuel.fuelFlowTotal = 0;
    for (const engine of state.engines) {
      engine.fuelFlow = 0;
      engine.thrust = 0;
      engine.running = false;
    }
  }

  state.zeroFuelWeight = spec.emptyWeight + state.payloadWeight;
  state.grossWeight = state.zeroFuelWeight + state.fuel.totalFuel;

  // CG shift: center tank arm = 22% MAC, wings = 30% MAC, empty aircraft = zeroFuelCg.
  const cgCenter = 22, cgWing = 30;
  const totalMass = state.zeroFuelWeight + state.fuel.totalFuel;
  if (totalMass > 0) {
    const calculatedCg = (
      state.zeroFuelWeight * state.zeroFuelCg +
      state.fuel.centerTank * cgCenter +
      (state.fuel.leftTank + state.fuel.rightTank) * cgWing
    ) / totalMass;
    state.cg = clamp(calculatedCg, spec.cgLimits[0], spec.cgLimits[1]);
  }
}
