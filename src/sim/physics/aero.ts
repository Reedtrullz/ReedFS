import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { isaAtAltitude } from './atmosphere';
import { lbfToN } from './units';
import type { AeroModel } from '../systems/AeroModel';
import { B737_AERO } from '../systems/AeroModel';

const G = 9.80665;

export interface AeroResult {
  thrust: number; drag: number; lift: number; side: number; weight: number;
  rollMoment: number; pitchMoment: number; yawMoment: number;
}

export function computeAero(state: AircraftState, inputs: ControlInputs, spec: AircraftSpec, aeroModel: AeroModel = B737_AERO): AeroResult {
  const { u, v, w } = state.velocity;
  const tasMs = Math.sqrt(u * u + v * v + w * w);
  const atmo = isaAtAltitude(state.position.alt);
  const rho = atmo.density;
  const q = 0.5 * rho * tasMs * tasMs;
  const S = spec.wingArea, b = spec.wingSpan, c = spec.meanChord;

  const aoa = tasMs > 1 ? Math.atan2(w, Math.abs(u) + 0.01) : 0;
  const beta = tasMs > 1 ? Math.asin(Math.max(-1, Math.min(1, v / tasMs))) : 0;
  const mach = tasMs / atmo.speedOfSound;

  // --- Lift ---
  const cl0 = aeroModel.cl0, clAlpha = aeroModel.clAlpha;
  const clFlap = flapClIncrement(aeroModel, state.config.flapSetting);
  const clMach = mach > 0.6 ? 1 + 0.3 * (mach - 0.6) : 1;
  const cl = (cl0 + clAlpha * aoa + clFlap) * clMach;

  // --- Drag ---
  const cd0 = aeroModel.cd0 + (state.config.flapSetting > 0 ? aeroModel.cdFlap : 0) + (state.config.gearDown ? aeroModel.cdGear : 0) + state.config.speedBrake * aeroModel.cdSpeedBrake;
  const ar = b * b / S, e = aeroModel.oswaldEfficiency, k = 1 / (Math.PI * ar * e);
  const cd = cd0 + k * cl * cl;

  // --- Side force ---
  const cyBeta = -0.9, cyRudder = 0.15;
  const cy = cyBeta * beta + cyRudder * inputs.rudder;

  const lift = q * S * cl;
  const drag = q * S * cd;
  const side = q * S * cy;
  const weight = state.grossWeight * G;

  // --- Thrust ---
  const n1Avg = (state.engines[0].n1 + state.engines[1].n1) / 200;
  const rhoRatio = atmo.density / 1.225;
  const staticThrust = lbfToN(spec.maxThrust) * Math.max(n1Avg, 0);
  const ramFactor = 1 + 0.15 * mach;
  const thrust = staticThrust * Math.pow(rhoRatio, 0.7) * ramFactor * spec.engineCount;

  // --- Moments ---
  const qHat = state.angularVel.q * c / (2 * Math.max(tasMs, 1));
  const cm = aeroModel.cm0 + aeroModel.cmAlpha * aoa + aeroModel.cmElevator * inputs.elevator * 0.3 + aeroModel.cmq * qHat - aeroModel.cmFlap * state.config.flapSetting;
  const pitchMoment = q * S * c * cm;

  const pHat = state.angularVel.p * b / (2 * Math.max(tasMs, 1));
  const clMoment = aeroModel.clBeta * beta + aeroModel.clAileron * inputs.aileron + aeroModel.clp * pHat;
  const rollMoment = q * S * b * clMoment;

  const rHat = state.angularVel.r * b / (2 * Math.max(tasMs, 1));
  const cn = aeroModel.cnBeta * beta + aeroModel.cnRudder * inputs.rudder + aeroModel.cnr * rHat;
  const yawMoment = q * S * b * cn;

  return { thrust, drag, lift, side, weight, rollMoment, pitchMoment, yawMoment };
}

function flapClIncrement(aeroModel: AeroModel, d: number): number {
  for (let i = aeroModel.flapDetents.length - 1; i >= 0; i--) {
    if (d >= aeroModel.flapDetents[i]) {
      return aeroModel.flapClIncrements[i];
    }
  }
  return 0;
}
