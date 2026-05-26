import type { AircraftState, AutopilotCommands, ControlInputs } from '../types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { computeRouteStatus, type NavOutput } from './navigation';
import { computeVNAV } from './vnav';
import { bodyToNed } from '../physics/frames';

// PID state (module-level — one set of integrators)
const rollIntegral = { value: 0, prevError: 0 };
const pitchIntegral = { value: 0, prevError: 0 };
const thrustIntegral = { value: 0, prevError: 0 };
const elevatorCommand = { value: 0 };
const throttleCommand = { value: 0 };

export interface AutopilotTargets {
  targetHeadingRad: number;
  targetAltFt: number;
  targetSpeedKt: number;
  targetVerticalSpeedFpm?: number;
}

const DEFAULT_TARGET_SPEED_KT = 250;
const ELEVATOR_RATE_LIMIT_PER_SEC = 1.5;
const THROTTLE_RATE_LIMIT_PER_SEC = 1.5;
const MAX_VS_ELEVATOR = 0.35;

function finiteOrUndefined(value: number | undefined | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function validActiveLegIndexOrNull(value: number | undefined | null): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
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

function rateLimit(current: number, target: number, maxDelta: number): number {
  return current + clamp(target - current, -maxDelta, maxDelta);
}

function currentVerticalSpeedFpm(state: AircraftState): number {
  const ned = bodyToNed(state.velocity, state.attitude);
  return -ned.down * 196.850394;
}

function rateLimitElevator(target: number, dt: number): number {
  const limited = rateLimit(
    elevatorCommand.value,
    clamp(target, -MAX_VS_ELEVATOR, MAX_VS_ELEVATOR),
    ELEVATOR_RATE_LIMIT_PER_SEC * Math.max(0, dt),
  );
  elevatorCommand.value = limited;
  return limited;
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
  elevatorCommand.value = 0;
  throttleCommand.value = 0;
}

export function isAutopilotEngaged(apState: AutopilotState | null | undefined): boolean {
  return Boolean(apState && apState.truth.autopilotStatus !== 'OFF');
}

export function resolveAutopilotTargets(
  state: AircraftState,
  apState: AutopilotState,
  flightPlan?: FlightPlan | null,
  activeLegIndex?: number | null,
): AutopilotTargets {
  let targetHeading = state.attitude.psi;
  let targetAlt = state.position.alt;
  const selectedSpeed = finiteOrUndefined(apState.boeing.speed);
  let targetSpeed = selectedSpeed ?? DEFAULT_TARGET_SPEED_KT;
  let targetVerticalSpeed: number | undefined;
  let activeLegNav: NavOutput | null | undefined;
  const validActiveLegIndex = validActiveLegIndexOrNull(activeLegIndex);

  const navForActiveLeg = (): NavOutput | null => {
    if (activeLegNav !== undefined) return activeLegNav;
    const legIndex = validActiveLegIndex;
    if (!flightPlan || legIndex === null) {
      activeLegNav = null;
      return activeLegNav;
    }

    const routeStatus = computeRouteStatus(state, flightPlan, legIndex);
    if (routeStatus?.lnavAvailable && routeStatus.desiredTrackRad !== null) {
      const nav: NavOutput = {
        crossTrackError: 0,
        alongTrackDist: routeStatus.distanceToNextM ?? 0,
        desiredTrack: routeStatus.desiredTrackRad,
        activeWaypointIndex: routeStatus.toWaypointIndex ?? legIndex,
        waypointReached: routeStatus.waypointReached,
      };
      activeLegNav = nav;
      return nav;
    }

    activeLegNav = null;
    return activeLegNav;
  };

  if (apState.truth.lateralActive === 'HDG_SEL') {
    targetHeading = (finiteOrUndefined(apState.boeing.heading) ?? 0) * Math.PI / 180;
  }

  if (apState.truth.verticalActive === 'ALT_HOLD') {
    const selectedAltitude = finiteOrUndefined(apState.boeing.altitude);
    if (selectedAltitude !== undefined && selectedAltitude > 0) targetAlt = selectedAltitude;
  }

  if (apState.truth.verticalActive === 'VS') {
    targetVerticalSpeed = finiteOrUndefined(apState.boeing.verticalSpeed) ?? 0;
  }

  // LNAV: compute desired track from the active route leg only.
  if (apState.truth.lateralActive === 'LNAV' && flightPlan) {
    const nav = navForActiveLeg();
    if (nav) targetHeading = nav.desiredTrack;
  }

  // VNAV: only expose altitude/VS/speed targets when the active route leg has an actionable constraint.
  if (apState.truth.verticalActive === 'VNAV' && flightPlan) {
    const nav = navForActiveLeg();
    if (nav) {
      const vnav = computeVNAV(state, flightPlan, nav);
      if (vnav.available) {
        if (vnav.altitudeConstraint) {
          targetAlt = vnav.targetAlt;
          targetVerticalSpeed = vnav.targetVs;
        }
        if (vnav.speedConstraint && selectedSpeed === undefined && apState.truth.thrustActive === 'SPEED') {
          targetSpeed = vnav.targetSpeedKt ?? targetSpeed;
        }
      }
    }
  }

  return {
    targetHeadingRad: targetHeading,
    targetAltFt: targetAlt,
    targetSpeedKt: targetSpeed,
    targetVerticalSpeedFpm: targetVerticalSpeed,
  };
}

export function computeAutopilotCommands(
  state: AircraftState,
  apState: AutopilotState,
  targetHeadingRad: number,
  targetAltFt: number,
  targetSpeedKt: number,
  dt: number,
  targetVerticalSpeedFpm?: number,
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
    const rawElevator = pid(pitchIntegral, altErr, 0.00004, 0.000001, 0.00001, dt);
    commands.elevator = rateLimitElevator(rawElevator, dt);
  } else if (t.verticalActive === 'VS' || t.verticalActive === 'VNAV') {
    const selectedVs = t.verticalActive === 'VS'
      ? finiteOrUndefined(apState.boeing.verticalSpeed) ?? 0
      : finiteOrUndefined(targetVerticalSpeedFpm);
    if (selectedVs !== undefined) {
      const vsErr = currentVerticalSpeedFpm(state) - selectedVs;
      const rawElevator = pid(pitchIntegral, vsErr, 0.00008, 0.0000005, 0.000002, dt);
      commands.elevator = rateLimitElevator(rawElevator, dt);
    }
  }

  // ── Thrust ──
  if (t.thrustActive === 'SPEED') {
    const tas = Math.sqrt(state.velocity.u ** 2 + state.velocity.v ** 2 + state.velocity.w ** 2) * 1.944; // m/s → kts
    const spdErr = targetSpeedKt - tas;
    const thr = pid(thrustIntegral, spdErr, 0.002, 0.00005, 0.0005, dt);
    const desired = clamp01(thr);
    const clamped = rateLimit(throttleCommand.value, desired, THROTTLE_RATE_LIMIT_PER_SEC * Math.max(0, dt));
    throttleCommand.value = clamped;
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
  activeLegIndex?: number | null,
): AutopilotCommands {
  if (!apState || !isAutopilotEngaged(apState)) return {};
  const targets = resolveAutopilotTargets(state, apState, flightPlan, activeLegIndex);
  return computeAutopilotCommands(
    state,
    apState,
    targets.targetHeadingRad,
    targets.targetAltFt,
    targets.targetSpeedKt,
    dt,
    targets.targetVerticalSpeedFpm,
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
