import type { AircraftState, AutopilotCommands, ControlInputs } from '../types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { computeLNAV } from './navigation';
import { computeVNAV } from './vnav';

// PID state (module-level — one set of integrators)
const rollIntegral = { value: 0, prevError: 0 };
const pitchIntegral = { value: 0, prevError: 0 };
const thrustIntegral = { value: 0, prevError: 0 };

export interface AutopilotTargets {
  targetHeadingRad: number;
  targetAltFt: number;
  targetSpeedKt: number;
}

const DEFAULT_TARGET_SPEED_KT = 250;

function finiteOrUndefined(value: number | undefined | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampSigned(value: number): number {
  return clamp(value, -1, 1);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeHeadingError(rad: number): number {
  let err = rad;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  return err;
}

function pid(pidState: { value: number; prevError: number }, error: number, kp: number, ki: number, kd: number, dt: number): number {
  pidState.value += error * dt;
  const deriv = (error - pidState.prevError) / Math.max(dt, 0.001);
  pidState.prevError = error;
  return kp * error + ki * pidState.value + kd * deriv;
}

export function resetAutopilotPID(): void {
  rollIntegral.value = 0;
  rollIntegral.prevError = 0;
  pitchIntegral.value = 0;
  pitchIntegral.prevError = 0;
  thrustIntegral.value = 0;
  thrustIntegral.prevError = 0;
}

export function isAutopilotEngaged(apState: AutopilotState | null | undefined): boolean {
  return Boolean(apState && apState.truth.autopilotStatus !== 'OFF');
}

export function resolveAutopilotTargets(
  state: AircraftState,
  apState: AutopilotState,
  flightPlan?: FlightPlan | null,
): AutopilotTargets {
  let targetHeading = state.attitude.psi;
  let targetAlt = state.position.alt;
  let targetSpeed = finiteOrUndefined(apState.boeing.speed) ?? DEFAULT_TARGET_SPEED_KT;

  if (apState.truth.lateralActive === 'HDG_SEL') {
    targetHeading = (finiteOrUndefined(apState.boeing.heading) ?? 0) * Math.PI / 180;
  }

  if (apState.truth.verticalActive === 'ALT_HOLD') {
    const selectedAltitude = finiteOrUndefined(apState.boeing.altitude);
    if (selectedAltitude !== undefined && selectedAltitude > 0) targetAlt = selectedAltitude;
  }

  if (apState.truth.thrustActive === 'SPEED') {
    targetSpeed = finiteOrUndefined(apState.boeing.speed) ?? targetSpeed;
  }

  // LNAV: compute desired track from flight plan
  if (apState.truth.lateralActive === 'LNAV' && flightPlan) {
    const nav = computeLNAV(state, flightPlan, 0);
    targetHeading = nav.desiredTrack;
  }

  // VNAV: compute target altitude from flight plan
  if (apState.truth.verticalActive === 'VNAV' && flightPlan) {
    const navDefault = {
      crossTrackError: 0,
      alongTrackDist: 0,
      desiredTrack: targetHeading,
      activeWaypointIndex: 0,
      waypointReached: false,
    };
    const vnav = computeVNAV(state, flightPlan, navDefault);
    if (vnav.altitudeConstraint) {
      targetAlt = vnav.targetAlt;
    }
  }

  return { targetHeadingRad: targetHeading, targetAltFt: targetAlt, targetSpeedKt: targetSpeed };
}

export function computeAutopilotCommands(
  state: AircraftState,
  apState: AutopilotState,
  targetHeadingRad: number,
  targetAltFt: number,
  targetSpeedKt: number,
  dt: number,
): AutopilotCommands {
  if (!isAutopilotEngaged(apState)) return {};

  const t = apState.truth;
  const commands: AutopilotCommands = {};

  // ── Lateral ──
  if (t.lateralActive === 'HDG_SEL' || t.lateralActive === 'LNAV') {
    const hdgErr = normalizeHeadingError(targetHeadingRad - state.attitude.psi);
    commands.aileron = clampSigned(pid(rollIntegral, hdgErr, 0.03, 0.002, 0.01, dt));
  }

  // ── Vertical ──
  if (t.verticalActive === 'ALT_HOLD') {
    const altErr = state.position.alt - targetAltFt;
    commands.elevator = clampSigned(pid(pitchIntegral, altErr, 0.00004, 0.000001, 0.00001, dt));
  }

  // ── Thrust ──
  if (t.thrustActive === 'SPEED') {
    const tas = Math.sqrt(state.velocity.u ** 2 + state.velocity.v ** 2 + state.velocity.w ** 2) * 1.944; // m/s → kts
    const spdErr = targetSpeedKt - tas;
    const thr = pid(thrustIntegral, spdErr, 0.002, 0.00005, 0.0005, dt);
    const clamped = clamp01(thr);
    commands.throttle1 = clamped;
    commands.throttle2 = clamped;
  }

  return commands;
}

export function computeAutopilotCommandsForState(
  state: AircraftState,
  apState: AutopilotState | null | undefined,
  flightPlan: FlightPlan | null | undefined,
  dt: number,
): AutopilotCommands {
  if (!apState || !isAutopilotEngaged(apState)) return {};
  const targets = resolveAutopilotTargets(state, apState, flightPlan);
  return computeAutopilotCommands(
    state,
    apState,
    targets.targetHeadingRad,
    targets.targetAltFt,
    targets.targetSpeedKt,
    dt,
  );
}

export function composeEffectiveControls(
  pilotInputs: ControlInputs,
  apCommands: AutopilotCommands = {},
  apActive = false,
  manualOverride = false,
): ControlInputs {
  const effective: ControlInputs = { ...pilotInputs };
  if (!apActive || manualOverride) return effective;

  const elevator = finiteOrUndefined(apCommands.elevator);
  if (elevator !== undefined) effective.elevator = clampSigned(elevator);

  const aileron = finiteOrUndefined(apCommands.aileron);
  if (aileron !== undefined) effective.aileron = clampSigned(aileron);

  const throttle1 = finiteOrUndefined(apCommands.throttle1);
  if (throttle1 !== undefined) effective.throttle1 = clamp01(throttle1);

  const throttle2 = finiteOrUndefined(apCommands.throttle2);
  if (throttle2 !== undefined) effective.throttle2 = clamp01(throttle2);

  return effective;
}
