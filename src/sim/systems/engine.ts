import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { B737_800_FDM } from '../data/aircraft/b737-800-fdm.v1';
import type { EngineModelData, EngineThrustLapsePointData } from '../data/aircraft/fdmTypes';
import { isaAtAltitude } from '../physics/atmosphere';
import { lbfToN } from '../physics/units';
import { computeAirRelativeVelocity } from './environment';
import type { WindInfo } from '../weather';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function machFromState(state: AircraftState, wind: WindInfo | null = null): number {
  const airRelative = computeAirRelativeVelocity(state, wind);
  const speedMs = Math.sqrt(airRelative.u ** 2 + airRelative.v ** 2 + airRelative.w ** 2);
  return speedMs / isaAtAltitude(state.position.alt).speedOfSound;
}

function fuelAvailableKg(state: AircraftState): number {
  return Math.max(0, state.fuel.centerTank) + Math.max(0, state.fuel.leftTank) + Math.max(0, state.fuel.rightTank);
}

function lapseDistance(point: EngineThrustLapsePointData, altitudeFt: number, mach: number): number {
  const altitudeDistance = (point.altitudeFt - altitudeFt) / 35_000;
  const machDistance = point.mach - mach;
  return altitudeDistance * altitudeDistance + machDistance * machDistance;
}

function lowerUpper(values: number[], target: number): [number, number] {
  if (values.length === 0) return [target, target];
  const clampedTarget = clamp(target, values[0], values[values.length - 1]);
  let lower = values[0];
  let upper = values[values.length - 1];
  for (const value of values) {
    if (value <= clampedTarget) lower = value;
    if (value >= clampedTarget) {
      upper = value;
      break;
    }
  }
  return [lower, upper];
}

function lookupLapse(table: EngineThrustLapsePointData[], altitudeFt: number, mach: number): number | undefined {
  return table.find((point) => Math.abs(point.altitudeFt - altitudeFt) < 1e-6 && Math.abs(point.mach - mach) < 1e-6)?.lapseFactor;
}

function interpolate(v00: number, v10: number, v01: number, v11: number, tx: number, ty: number): number {
  const low = v00 + (v10 - v00) * tx;
  const high = v01 + (v11 - v01) * tx;
  return low + (high - low) * ty;
}

function gridLapseFromTable(model: EngineModelData, altitudeFt: number, mach: number): number | undefined {
  const table = model.thrustLapseTable;
  const altitudes = [...new Set(table.map((point) => point.altitudeFt))].sort((a, b) => a - b);
  const machs = [...new Set(table.map((point) => point.mach))].sort((a, b) => a - b);
  const [alt0, alt1] = lowerUpper(altitudes, altitudeFt);
  const [mach0, mach1] = lowerUpper(machs, mach);
  const v00 = lookupLapse(table, alt0, mach0);
  const v10 = lookupLapse(table, alt1, mach0);
  const v01 = lookupLapse(table, alt0, mach1);
  const v11 = lookupLapse(table, alt1, mach1);
  if (v00 === undefined || v10 === undefined || v01 === undefined || v11 === undefined) return undefined;

  const tx = alt1 === alt0 ? 0 : (clamp(altitudeFt, alt0, alt1) - alt0) / (alt1 - alt0);
  const ty = mach1 === mach0 ? 0 : (clamp(mach, mach0, mach1) - mach0) / (mach1 - mach0);
  return interpolate(v00, v10, v01, v11, tx, ty);
}

function thrustLapseFromTable(model: EngineModelData, altitudeFt: number, mach: number): number {
  const table = model.thrustLapseTable;
  if (table.length === 0) return 1;

  const exact = lookupLapse(table, altitudeFt, mach);
  if (exact !== undefined) return clamp(exact, 0, 1.25);

  const gridLapse = gridLapseFromTable(model, altitudeFt, mach);
  if (gridLapse !== undefined) return clamp(gridLapse, 0, 1.25);

  const nearest = [...table]
    .sort((a, b) => lapseDistance(a, altitudeFt, mach) - lapseDistance(b, altitudeFt, mach))
    .slice(0, Math.min(4, table.length));
  let weighted = 0;
  let weightSum = 0;
  for (const point of nearest) {
    const distance = Math.max(1e-9, lapseDistance(point, altitudeFt, mach));
    const weight = 1 / distance;
    weighted += clamp(point.lapseFactor, 0, 1.25) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? weighted / weightSum : clamp(nearest[0].lapseFactor, 0, 1.25);
}

export function computeEngineThrustN(
  n1Percent: number,
  spec: AircraftSpec,
  altitudeFt: number,
  mach: number,
  engineModel: EngineModelData = B737_800_FDM.engine,
): number {
  const n1 = clamp(n1Percent, 0, 110) / 100;
  const baseStaticThrustN = lbfToN(spec.maxThrust) * n1 * n1;
  return baseStaticThrustN * thrustLapseFromTable(engineModel, altitudeFt, mach);
}

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
  wind: WindInfo | null = null,
): void {
  const mach = machFromState(state, wind);
  const engineModel = B737_800_FDM.engine;
  const fuelAvailable = fuelAvailableKg(state) > 1e-6;
  // Internal sub-stepping for numerical stability with large dt
  const subSteps = Math.max(1, Math.ceil(dt / 0.1));
  const subDt = dt / subSteps;

  for (let step = 0; step < subSteps; step++) {
    for (let i = 0; i < 2; i++) {
      const eng = state.engines[i];
      const throttle = i === 0 ? inputs.throttle1 : inputs.throttle2;

      // Target N1: non-linear throttle mapping (idle to TOGA) when fuel is available.
      const n1Target = fuelAvailable && throttle > 0.01
        ? engineModel.idleN1Percent + throttle * (engineModel.togaN1Percent - engineModel.idleN1Percent)
        : 0;

      // N1 spool: slower spool-down than spool-up
      const n1Error = n1Target - eng.n1;
      const n1Tc = n1Error > 0 ? engineModel.spoolUpTimeConstantSeconds : engineModel.spoolDownTimeConstantSeconds;
      eng.n1 += n1Error * (subDt / n1Tc);
      eng.n1 = Math.max(0, Math.min(110, eng.n1));

      // N2 spool: faster, roughly proportional to N1
      const n2Target = n1Target > 0
        ? engineModel.idleN2Percent + (n1Target - engineModel.idleN1Percent) * engineModel.n2PerN1Percent
        : 0;
      const n2Tc = engineModel.n2TimeConstantSeconds;
      eng.n2 += (n2Target - eng.n2) * (subDt / n2Tc);
      eng.n2 = Math.max(0, Math.min(110, eng.n2));

      // EGT: driven by combustion/core speed, cools toward ambient when fuel-starved.
      eng.egt = fuelAvailable && eng.n2 > 5
        ? engineModel.idleEgtC
          + eng.n2 * engineModel.egtPerN2PercentC
          - (eng.n2 > engineModel.highN2EgtReliefStartPercent
            ? (eng.n2 - engineModel.highN2EgtReliefStartPercent) * engineModel.highN2EgtReliefPerPercentC
            : 0)
        : 20;

      // Fuel flow (kg/hr): SFC-based, using the same table-backed thrust source exposed to physics.
      eng.thrust = fuelAvailable ? computeEngineThrustN(eng.n1, spec, state.position.alt, mach, engineModel) : 0;
      eng.fuelFlow = fuelAvailable ? eng.thrust * engineModel.fuelSfcKgPerNewtonHour : 0;
      eng.running = fuelAvailable && eng.n1 > 0.5;
    }
  }

  // Total fuel flow for both engines
  state.fuel.fuelFlowTotal = state.engines[0].fuelFlow + state.engines[1].fuelFlow;
}
