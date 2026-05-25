import type { AircraftState, AircraftSpec, ControlInputs } from '../types';

/**
 * Twin-spool turbofan engine model.
 * N1 (fan/low-pressure): slow spool, tc = 1.5-3.0s depending on power.
 * N2 (core/high-pressure): fast spool, tc = 0.6s.
 * EGT is a function of N2 and fuel flow.
 * Fuel flow = SFC * thrust, with SFC varying by altitude/power.
 */
export function updateEngines(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  dt: number,
): void {
  // Internal sub-stepping for numerical stability with large dt
  const subSteps = Math.max(1, Math.ceil(dt / 0.1));
  const subDt = dt / subSteps;

  for (let step = 0; step < subSteps; step++) {
    for (let i = 0; i < 2; i++) {
      const eng = state.engines[i];
      const throttle = i === 0 ? inputs.throttle1 : inputs.throttle2;

      // Target N1: non-linear throttle mapping (idle ~20%, TOGA ~100%)
      const n1Target = throttle > 0.01 ? 20 + throttle * 80 : 0;

      // N1 spool: slower spool-down than spool-up
      const n1Error = n1Target - eng.n1;
      const n1Tc = n1Error > 0 ? 1.5 : 3.0;
      eng.n1 += n1Error * (subDt / n1Tc);
      eng.n1 = Math.max(0, Math.min(110, eng.n1));

      // N2 spool: faster, roughly proportional to N1
      const n2Target = n1Target > 0 ? 22 + (n1Target - 20) * 1.05 : 0;
      const n2Tc = 0.6;
      eng.n2 += (n2Target - eng.n2) * (subDt / n2Tc);
      eng.n2 = Math.max(0, Math.min(110, eng.n2));

      // EGT: driven by N2 (~350°C idle, ~950°C TOGA)
      eng.egt = eng.n2 > 5 ? 350 + eng.n2 * 5.5 - (eng.n2 > 80 ? (eng.n2 - 80) * 2 : 0) : 20;

      // Fuel flow (kg/hr): SFC-based
      const thrustLbf = spec.maxThrust * (eng.n1 / 100) * (eng.n1 / 100);
      const sfc = 0.55; // lb fuel per lb thrust per hour (approximate cruise SFC)
      eng.fuelFlow = sfc * thrustLbf * 0.4536; // lb/hr → kg/hr
      eng.thrust = thrustLbf;
      eng.running = eng.n1 > 0.5;
    }
  }

  // Total fuel flow for both engines
  state.fuel.fuelFlowTotal = state.engines[0].fuelFlow + state.engines[1].fuelFlow;
}
