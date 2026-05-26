import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { isaAtAltitude } from './atmosphere';
import { computeAirRelativeVelocity } from '../systems/environment';
import type { AeroModel, FlapPolar } from '../systems/AeroModel';
import { B737_AERO } from '../systems/AeroModel';
import type { WindInfo } from '../weather';

const G = 9.80665;
const MAX_ELEVATOR_DEFLECTION_RAD = 0.3;
// Full keyboard/yoke aft input should rotate the aircraft but not keep adding
// unlimited nose-up moment after the useful takeoff pitch range. This is force
// shaping, not a hidden attitude clamp: the integrator still evolves q/theta.
const NOSE_UP_ELEVATOR_FADE_START_RAD = 8 * Math.PI / 180;
const NOSE_UP_ELEVATOR_FADE_END_RAD = 13 * Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function effectiveElevatorInput(input: number, pitchRad: number): number {
  if (input >= 0) return input;
  const authority = clamp(
    (NOSE_UP_ELEVATOR_FADE_END_RAD - pitchRad) / (NOSE_UP_ELEVATOR_FADE_END_RAD - NOSE_UP_ELEVATOR_FADE_START_RAD),
    0,
    1,
  );
  return input * authority;
}

function flapPolarForSetting(aeroModel: AeroModel, flapSetting: number): FlapPolar {
  for (let i = aeroModel.flapPolars.length - 1; i >= 0; i -= 1) {
    if (flapSetting >= aeroModel.flapPolars[i].detent) {
      return aeroModel.flapPolars[i];
    }
  }

  return aeroModel.flapPolars[0];
}

function liftCoefficientAtAoA(aoa: number, mach: number, polar: FlapPolar): { cl: number; stallFraction: number } {
  const machFactor = mach > 0.6 ? 1 + 0.3 * (mach - 0.6) : 1;
  const linearCl = polar.clAlpha * (aoa - polar.alphaZeroLiftRad) * machFactor;
  const negativeClMax = polar.clMax * 0.75;

  if (linearCl > polar.clMax) {
    const excess = linearCl - polar.clMax;
    const stallFraction = clamp(excess / polar.clMax, 0, 2);
    return {
      cl: Math.max(polar.clMax * 0.65, polar.clMax - excess * 0.35),
      stallFraction,
    };
  }

  if (linearCl < -negativeClMax) {
    const excess = Math.abs(linearCl) - negativeClMax;
    const stallFraction = clamp(excess / negativeClMax, 0, 2);
    return {
      cl: Math.min(-negativeClMax * 0.65, -negativeClMax + excess * 0.35),
      stallFraction,
    };
  }

  return { cl: linearCl, stallFraction: 0 };
}

export interface AeroResult {
  thrust: number; drag: number; dragBodyX: number; lift: number; side: number; weight: number;
  rollMoment: number; pitchMoment: number; yawMoment: number;
}

export function computeAero(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  aeroModel: AeroModel = B737_AERO,
  wind: WindInfo | null = null,
): AeroResult {
  const { u, v, w } = computeAirRelativeVelocity(state, wind);
  const tasMs = Math.sqrt(u * u + v * v + w * w);
  const atmo = isaAtAltitude(state.position.alt);
  const rho = atmo.density;
  const q = 0.5 * rho * tasMs * tasMs;
  const S = spec.wingArea, b = spec.wingSpan, c = spec.meanChord;

  const aoa = tasMs > 1 ? Math.atan2(w, Math.abs(u) + 0.01) : 0;
  const beta = tasMs > 1 ? Math.asin(Math.max(-1, Math.min(1, v / tasMs))) : 0;
  const mach = tasMs / atmo.speedOfSound;

  // --- Lift ---
  const polar = flapPolarForSetting(aeroModel, state.config.flapSetting);
  const { cl, stallFraction } = liftCoefficientAtAoA(aoa, mach, polar);

  // --- Drag ---
  const cd0 = polar.cd0 + (state.config.gearDown ? aeroModel.gearCd : 0) + state.config.speedBrake * aeroModel.speedBrakeCd;
  const cd = cd0 + polar.k * cl * cl + polar.stallDragRise * stallFraction * stallFraction;

  // --- Side force ---
  const cyBeta = -0.9, cyRudder = 0.15;
  const cy = cyBeta * beta + cyRudder * inputs.rudder;

  const lift = q * S * cl;
  const drag = q * S * cd;
  const dragBodyX = tasMs > 1 ? -drag * (u / tasMs) : 0;
  const side = q * S * cy;
  const weight = state.grossWeight * G;

  // --- Thrust ---
  const thrust = state.engines[0].thrust + state.engines[1].thrust;

  // --- Moments ---
  const qHat = state.angularVel.q * c / (2 * Math.max(tasMs, 1));
  const elevatorDeflectionRad = effectiveElevatorInput(inputs.elevator, state.attitude.theta) * MAX_ELEVATOR_DEFLECTION_RAD;
  const cm = aeroModel.cm0 + polar.deltaCm + aeroModel.cmAlpha * aoa + aeroModel.cmElevator * elevatorDeflectionRad + aeroModel.cmq * qHat;
  const pitchMoment = q * S * c * cm;

  const pHat = state.angularVel.p * b / (2 * Math.max(tasMs, 1));
  const clMoment = aeroModel.clBeta * beta + aeroModel.clAileron * inputs.aileron + aeroModel.clp * pHat;
  const rollMoment = q * S * b * clMoment;

  const rHat = state.angularVel.r * b / (2 * Math.max(tasMs, 1));
  const cn = aeroModel.cnBeta * beta + aeroModel.cnRudder * inputs.rudder + aeroModel.cnr * rHat;
  const yawMoment = q * S * b * cn;

  return { thrust, drag, dragBodyX, lift, side, weight, rollMoment, pitchMoment, yawMoment };
}
