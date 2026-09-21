import type { AircraftState, AutopilotCommands, ControlInputs } from '../types';
import type { AutoflightTruthState, AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../weather';
import {
  computeRouteStatus,
  type RouteStatusSnapshot,
} from './navigation';
import {
  computeN1TargetPercent as computeSharedN1TargetPercent,
  resolveGuidanceTargets,
} from './guidanceTargets';
import { bodyToNed } from '../physics/frames';
import { computeDerived } from '../physics/derived';
import { deriveEffectiveAutoflightTruth } from './effectiveAutoflightTruth';

// ── Serializable controller state ───────────────────────────────────────

export interface AutopilotPidState {
  value: number;
  prevError: number;
}

export interface AutopilotControllerState {
  pitchPid: AutopilotPidState;
  rollPid: AutopilotPidState;
  thrustPid: AutopilotPidState;
  pitchTargetIntegral: AutopilotPidState;
  /** Rate-limited commanded vertical speed (fpm) used by the VS tracker. */
  vsCommandFpm?: number;
  /** Last commanded VS pitch target (deg), used for slew limiting. */
  vsPitchTargetDeg?: number;
  throttleLimited: number;
}

export interface AutopilotCommandResult {
  commands: AutopilotCommands;
  controllerState: AutopilotControllerState;
}

function createPidState(): AutopilotPidState {
  return { value: 0, prevError: 0 };
}

export function createAutopilotControllerState(): AutopilotControllerState {
  return {
    pitchPid: createPidState(),
    rollPid: createPidState(),
    thrustPid: createPidState(),
    pitchTargetIntegral: createPidState(),
    throttleLimited: 0,
  };
}

export function cloneAutopilotControllerState(
  state: AutopilotControllerState | null | undefined,
): AutopilotControllerState {
  return structuredClone(state ?? createAutopilotControllerState());
}

// ── Constants ───────────────────────────────────────────────────────────

const PITCH_MIN_DEG = -10;
const PITCH_MAX_DEG = 20;
const BANK_MAX_DEG = 30;
const THROTTLE_RATE_PER_SEC = 1.5;
const VS_PITCH_TARGET_SLEW_DEG_PER_SEC = 3;
// Rate-limit the VS setpoint: on engagement or retarget the commanded VS
// starts at the current VS and ramps toward the target, so the tracker never
// sees a multi-thousand-fpm error spike right after a mode change.
const VS_CAPTURE_RAMP_FPM_PER_SEC = 1000;
// Engagement seeding must never command *further* from the selected VS than a
// bounded offset: seeding from a zooming current VS (e.g. +16000 fpm) told the
// tracker to sustain the zoom for seconds before ramping down.
const VS_ENGAGEMENT_SEED_MAX_OFFSET_FPM = 2_000;
// Baseline nose-up allowance while tracking a commanded descent. The tracker
// may exceed this only to arrest a large sink-rate error (dive protection),
// where a flat cap would make a developed dive unrecoverable.
const VS_DESCENT_MAX_NOSE_UP_DEG = 6;
const VS_DIVE_ARREST_ERROR_FPM = 2_000;
const VS_DIVE_ARREST_MAX_NOSE_UP_DEG = 15;

// ── Helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
function clampSigned(v: number): number { return clamp(v, -1, 1); }
function clamp01(v: number): number { return clamp(v, 0, 1); }
function finiteOrUndefined(v: number | undefined | null): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function radToDeg(r: number): number { return r * 180 / Math.PI; }
function headingErrorRad(target: number, current: number): number {
  let e = target - current;
  while (e > Math.PI) e -= 2 * Math.PI;
  while (e < -Math.PI) e += 2 * Math.PI;
  return e;
}
function currentVsFpm(state: AircraftState): number {
  const ned = bodyToNed(state.velocity, state.attitude);
  return -ned.down * 196.850394;
}
function currentIasKt(state: AircraftState, wind: WindInfo | null = null): number {
  return computeDerived(state, wind).ias;
}
function pid(
  s: { value: number; prevError: number },
  err: number,
  kp: number,
  ki: number,
  kd: number,
  dt: number,
  maxI = 3,
  maxDerivative = Number.POSITIVE_INFINITY,
): number {
  s.value = clamp(s.value + err * dt, -maxI, maxI);
  const rawDerivative = (err - s.prevError) / Math.max(dt, 0.001);
  const deriv = clamp(rawDerivative, -maxDerivative, maxDerivative);
  s.prevError = err;
  return kp * err + ki * s.value + kd * deriv;
}
function throttleForN1(targetN1: number): number {
  return clamp01((targetN1 - 20) / 80);
}

// ── Public API ──────────────────────────────────────────────────────────

export function resetAutopilotPID(): void {
  // Legacy compatibility for one-step unit tests. Runtime/store resets now replace their
  // explicit AutopilotControllerState instead of mutating module globals.
}

export function isAutopilotEngaged(ap: AutopilotState | null | undefined): boolean {
  return Boolean(ap && ap.truth.autopilotStatus !== 'OFF');
}

function apWithEffectiveTruth(ap: AutopilotState, truth: AutoflightTruthState): AutopilotState {
  return { ...ap, truth };
}

function hasVerticalGuidance(truth: AutoflightTruthState): boolean {
  return truth.verticalActive === 'ALT_HOLD'
    || truth.verticalActive === 'VS'
    || truth.verticalActive === 'VNAV'
    || truth.verticalActive === 'VNAV_PTH'
    || truth.verticalActive === 'ALT*'
    || truth.verticalActive === 'G_S';
}

function hasLateralGuidance(truth: AutoflightTruthState): boolean {
  return truth.lateralActive === 'HDG_SEL' || truth.lateralActive === 'LNAV' || truth.lateralActive === 'APP';
}

function hasThrustGuidance(truth: AutoflightTruthState): boolean {
  return truth.thrustActive === 'SPEED' || truth.thrustActive === 'N1' || truth.thrustActive === 'RETARD';
}

export function computeN1TargetPercent(state: AircraftState): number {
  return computeSharedN1TargetPercent(state);
}

// ── Target resolution ───────────────────────────────────────────────────

interface Targets {
  targetHeadingRad: number;
  targetAltFt: number;
  targetSpeedKt: number;
  targetVerticalSpeedFpm?: number;
  targetN1Percent?: number;
  targetPitchDeg?: number;
  targetThrottle?: number;
}

export function resolveAutopilotTargets(
  state: AircraftState,
  ap: AutopilotState,
  flightPlan?: FlightPlan | null,
  activeLegIndex?: number | null,
  routeStatusOverride?: RouteStatusSnapshot | null,
): Targets {
  const shared = resolveGuidanceTargets({
    aircraft: state,
    apState: ap,
    flightPlan: flightPlan ?? null,
    activeLegIndex,
    routeStatus: routeStatusOverride ?? null,
    truthOverride: ap.truth,
  });

  const targetAltFt = shared.vertical?.mode === 'VS'
    ? state.position.alt
    : shared.vertical?.targetAltitudeFt ?? state.position.alt;

  return {
    targetHeadingRad: shared.lateral?.targetHeadingRad ?? state.attitude.psi,
    targetAltFt,
    targetSpeedKt: shared.thrust?.targetSpeedKt ?? finiteOrUndefined(ap.boeing.speed) ?? 250,
    targetVerticalSpeedFpm: shared.vertical?.targetVerticalSpeedFpm,
    targetN1Percent: shared.thrust?.targetN1Percent,
    targetPitchDeg: shared.vertical?.targetPitchDeg,
    targetThrottle: shared.thrust?.targetThrottle,
  };
}

// ── Inner loops: attitude control ───────────────────────────────────────

/** Pitch inner loop: holds a target pitch angle via elevator. */
function pitchHold(controllerState: AutopilotControllerState, targetPitchDeg: number, state: AircraftState, dt: number): number {
  const currentPitchDeg = radToDeg(state.attitude.theta);
  const err = targetPitchDeg - currentPitchDeg;
  // elevator convention: negative = nose-up, positive = nose-down
  return clampSigned(pid(controllerState.pitchPid, -err, 0.30, 0.08, 0.10, dt, 4, 4));
}

/** Roll inner loop: holds a target bank angle via aileron. */
function bankHold(controllerState: AutopilotControllerState, targetBankDeg: number, state: AircraftState, dt: number): number {
  const currentBankDeg = radToDeg(state.attitude.phi);
  const err = targetBankDeg - currentBankDeg;
  return clampSigned(pid(controllerState.rollPid, err, 0.06, 0.01, 0.03, dt, 2));
}

// ── Outer loops: navigation targets → attitude targets ──────────────────

/** Heading outer loop: converts heading error to bank angle target. */
function headingToBank(targetHeadingRad: number, state: AircraftState): number {
  const errRad = headingErrorRad(targetHeadingRad, state.attitude.psi);
  // 25° bank for 90° heading error
  const targetBankDeg = clamp(errRad * radToDeg(1) * 0.28, -BANK_MAX_DEG, BANK_MAX_DEG);
  return targetBankDeg;
}

/** Altitude outer loop: converts altitude error to pitch target. */
function altitudeToPitch(controllerState: AutopilotControllerState, targetAltFt: number, state: AircraftState, dt: number): number {
  const err = targetAltFt - state.position.alt;
  // P=0.004: 250ft error → 1° pitch adjustment
  const pitchAdjustDeg = pid(controllerState.pitchTargetIntegral, err, 0.004, 0.0008, 0, dt, 4);
  return clamp(pitchAdjustDeg, -10, 15);
}

/** VS outer loop: adjusts pitch to track vertical speed. */
function vsToPitch(
  controllerState: AutopilotControllerState,
  targetVerticalSpeedFpm: number,
  state: AircraftState,
  dt: number,
  maxNoseUpDeg = 15,
): number {
  const currentVs = currentVsFpm(state);
  // Engagement seeding: the first VS frame ramps from whatever VS the aircraft
  // actually has instead of snapping the command to the MCP value.
  const previousCommand = controllerState.vsCommandFpm
    ?? clamp(
      currentVs,
      targetVerticalSpeedFpm - VS_ENGAGEMENT_SEED_MAX_OFFSET_FPM,
      targetVerticalSpeedFpm + VS_ENGAGEMENT_SEED_MAX_OFFSET_FPM,
    );
  const rampedCommand = clamp(
    targetVerticalSpeedFpm > previousCommand
      ? Math.min(previousCommand + VS_CAPTURE_RAMP_FPM_PER_SEC * dt, targetVerticalSpeedFpm)
      : Math.max(previousCommand - VS_CAPTURE_RAMP_FPM_PER_SEC * dt, targetVerticalSpeedFpm),
    -6000,
    6000,
  );
  controllerState.vsCommandFpm = rampedCommand;
  const err = rampedCommand - currentVs;
  // Gains sized so a 1000 fpm error commands roughly 1.5 deg of climb pitch,
  // with integral action closing sustained offsets like energy-starved climbs.
  // The pitch target slews at 3 deg/s so mode engagement never spikes the
  // pitch-hold derivative and kicks the elevator.
  // maxI bounds the integral *state* (fpm-seconds), not degrees; ki=0.0004 turns
  // 15000 into 6 deg of sustained trim authority so the tracker can actually
  // hold a commanded climb/descent instead of stalling at the P-only offset.
  const rawPitchAdjustDeg = pid(controllerState.pitchTargetIntegral, err, 0.0012, 0.0004, 0, dt, 15000);
  // Seed the slew from the aircraft's current attitude: starting from 0 deg
  // while the AP engages in a climb would command an immediate bunt.
  const previousPitchTarget = controllerState.vsPitchTargetDeg
    ?? state.attitude.theta * 180 / Math.PI;
  const maxSlewDeg = VS_PITCH_TARGET_SLEW_DEG_PER_SEC * dt;
  const pitchAdjustDeg = clamp(rawPitchAdjustDeg - previousPitchTarget, -maxSlewDeg, maxSlewDeg) + previousPitchTarget;
  controllerState.vsPitchTargetDeg = pitchAdjustDeg;
  return clamp(pitchAdjustDeg, -8, maxNoseUpDeg);
}

// ── Main command computation ────────────────────────────────────────────

export function computeAutopilotCommands(
  state: AircraftState,
  ap: AutopilotState,
  targetHeadingRad: number,
  targetAltFt: number,
  targetSpeedKt: number,
  dt: number,
  targetVerticalSpeedFpm?: number,
  targetN1Percent?: number,
  wind: WindInfo | null = null,
  targetPitchDeg?: number,
  targetThrottle?: number,
): AutopilotCommands {
  return computeAutopilotCommandsWithControllerState(
    state,
    ap,
    targetHeadingRad,
    targetAltFt,
    targetSpeedKt,
    dt,
    targetVerticalSpeedFpm,
    targetN1Percent,
    wind,
    undefined,
    targetPitchDeg,
    targetThrottle,
  ).commands;
}

export function computeAutopilotCommandsWithControllerState(
  state: AircraftState,
  ap: AutopilotState,
  targetHeadingRad: number,
  targetAltFt: number,
  targetSpeedKt: number,
  dt: number,
  targetVerticalSpeedFpm?: number,
  targetN1Percent?: number,
  wind: WindInfo | null = null,
  controllerState: AutopilotControllerState = createAutopilotControllerState(),
  targetPitchDeg?: number,
  targetThrottle?: number,
): AutopilotCommandResult {
  const t = ap.truth;
  const autopilotEngaged = isAutopilotEngaged(ap);
  const nextControllerState = cloneAutopilotControllerState(controllerState);
  if (!autopilotEngaged && !hasThrustGuidance(t)) {
    return { commands: {}, controllerState: nextControllerState };
  }

  const cmd: AutopilotCommands = {};

  // ── Pitch target ──
  let pitchTargetDeg: number | undefined;

  if (autopilotEngaged && hasVerticalGuidance(t)) {
    if (t.verticalActive === 'ALT_HOLD') {
      pitchTargetDeg = altitudeToPitch(nextControllerState, targetAltFt, state, dt);
    } else if (t.verticalActive === 'VS') {
      const vs = finiteOrUndefined(targetVerticalSpeedFpm) ?? finiteOrUndefined(ap.boeing.verticalSpeed) ?? 0;
      const commandedDescent = vs < -100;
      const currentVs = currentVsFpm(state);
      // Dive arrest: when tracking a descent and the actual sink rate exceeds
      // the commanded descent by a large margin, the tracker gets full nose-up
      // authority so a developed dive can be pulled out. The baseline cap only
      // bounds ordinary tracking error.
      const diveArrest = commandedDescent
        && currentVs < vs - VS_DIVE_ARREST_ERROR_FPM;
      pitchTargetDeg = vsToPitch(
        nextControllerState,
        vs,
        state,
        dt,
        commandedDescent
          ? (diveArrest ? VS_DIVE_ARREST_MAX_NOSE_UP_DEG : VS_DESCENT_MAX_NOSE_UP_DEG)
          : 15,
      );
    } else if (t.verticalActive === 'VNAV' || t.verticalActive === 'VNAV_PTH' || t.verticalActive === 'ALT*') {
      const vs = finiteOrUndefined(targetVerticalSpeedFpm);
      if (vs !== undefined) pitchTargetDeg = vsToPitch(nextControllerState, vs, state, dt);
    } else if (t.verticalActive === 'G_S') {
      const flarePitchTargetDeg = finiteOrUndefined(targetPitchDeg);
      const vs = finiteOrUndefined(targetVerticalSpeedFpm);
      if (flarePitchTargetDeg !== undefined) {
        pitchTargetDeg = flarePitchTargetDeg;
      } else if (vs !== undefined) {
        pitchTargetDeg = vsToPitch(nextControllerState, vs, state, dt);
      }
    }

    if (pitchTargetDeg !== undefined) {
      pitchTargetDeg = clamp(pitchTargetDeg, PITCH_MIN_DEG, PITCH_MAX_DEG);
      cmd.elevator = pitchHold(nextControllerState, pitchTargetDeg, state, dt);
    }
  }

  // ── Bank target ──
  if (autopilotEngaged && hasLateralGuidance(t)) {
    let bankTargetDeg = 0; // default: wings level
    if (t.lateralActive === 'HDG_SEL' || t.lateralActive === 'LNAV' || t.lateralActive === 'APP') {
      bankTargetDeg = headingToBank(targetHeadingRad, state);
    }
    cmd.aileron = bankHold(nextControllerState, bankTargetDeg, state, dt);
  }

  // ── Thrust ──
  if (t.thrustActive === 'SPEED') {
    const iasKt = currentIasKt(state, wind);
    const spdErr = targetSpeedKt - iasKt;
    const altFt = state.position.alt;
    const deficit = targetSpeedKt - iasKt;
    const vsFpm = currentVsFpm(state);
    const selectedVerticalSpeedFpm = finiteOrUndefined(targetVerticalSpeedFpm) ?? finiteOrUndefined(ap.boeing.verticalSpeed);
    const selectedVsDescent = t.verticalActive === 'VS' && selectedVerticalSpeedFpm !== undefined && selectedVerticalSpeedFpm < -100;
    const aboveTarget = t.verticalActive === 'ALT_HOLD' && state.position.alt > targetAltFt + 200;

    const thr = pid(nextControllerState.thrustPid, spdErr, aboveTarget ? 0.003 : 0.008, aboveTarget ? 0.0005 : 0.002, 0.003, dt, 5);

    let minT: number;

    if (state.ground.weightOnWheels) {
      minT = 0;
    } else if (deficit < -10 && (selectedVsDescent || t.verticalActive === 'ALT_HOLD')) {
      // Well above the MCP bug in VS or ALT_HOLD: idle. The clamp floor is the
      // commanded thrust at steady state, so a phase-keyed floor here would
      // force the aircraft to accelerate until drag catches up.
      minT = 0.05;
    } else if (selectedVsDescent) {
      // VS + A/T SPEED: the thrust PID gains are too small to schedule
      // mid-range thrust at small speed errors, so the floor is the descent
      // energy scheduler. Underspeed gets climb-out thrust; near the bug a
      // light floor lets the shallow descent hold speed without acceleration.
      // The floor scales with the deficit: a flat mid floor left the aircraft
      // energy-starved at altitude, bleeding into a stall despite A/T SPEED.
      minT = deficit > 30 ? 0.85 : deficit > 10 ? 0.70 : deficit > 5 ? 0.55 : 0.15;
    } else if (aboveTarget && vsFpm < 0) {
      minT = 0.15; // descending toward target: let the dive do the work
    } else if (aboveTarget && deficit > 10) {
      minT = 0.25; // above target, slow — don't add energy
    } else if (deficit > 30) {
      minT = 0.75;
    } else if (deficit > 10) {
      minT = 0.60;
    } else if (vsFpm < -500) {
      minT = 0.70;
    } else if (state.flightPhase === 'CLIMB' && deficit >= -10) {
      minT = 0.55;
    } else if (altFt > 15000) {
      minT = 0.50;
    } else {
      minT = 0.40;
    }

    const raw = clamp(thr, minT, 1);
    // Rate-limit throttle changes for smooth engine response
    const maxDelta = THROTTLE_RATE_PER_SEC * Math.max(0, dt);
    nextControllerState.throttleLimited = clamp(
      raw,
      nextControllerState.throttleLimited - maxDelta,
      nextControllerState.throttleLimited + maxDelta,
    );
    cmd.throttle1 = nextControllerState.throttleLimited;
    cmd.throttle2 = nextControllerState.throttleLimited;
  } else if (t.thrustActive === 'N1' && ap.boeing.autothrottleArm && targetN1Percent !== undefined) {
    const avgN1 = (state.engines[0].n1 + state.engines[1].n1) / 2;
    const base = throttleForN1(targetN1Percent);
    const correction = clamp((targetN1Percent - avgN1) * 0.01, -0.15, 0.15);
    cmd.throttle1 = clamp01(base + correction);
    cmd.throttle2 = cmd.throttle1;
  } else if (t.thrustActive === 'RETARD' && ap.boeing.autothrottleArm) {
    const idleThrottle = clamp01(finiteOrUndefined(targetThrottle) ?? 0);
    nextControllerState.throttleLimited = idleThrottle;
    cmd.throttle1 = idleThrottle;
    cmd.throttle2 = idleThrottle;
  }

  return { commands: cmd, controllerState: nextControllerState };
}

// ── Convenience wrapper ─────────────────────────────────────────────────

export function computeAutopilotCommandsForState(
  state: AircraftState,
  ap: AutopilotState | null | undefined,
  flightPlan: FlightPlan | null | undefined,
  dt: number,
  activeLegIndex?: number | null,
  routeStatus?: RouteStatusSnapshot | null,
  wind: WindInfo | null = null,
): AutopilotCommands {
  return computeAutopilotCommandsForStateWithControllerState(
    state,
    ap,
    flightPlan,
    dt,
    activeLegIndex,
    routeStatus,
    wind,
  ).commands;
}

export function computeAutopilotCommandsForStateWithControllerState(
  state: AircraftState,
  ap: AutopilotState | null | undefined,
  flightPlan: FlightPlan | null | undefined,
  dt: number,
  activeLegIndex?: number | null,
  routeStatus?: RouteStatusSnapshot | null,
  wind: WindInfo | null = null,
  controllerState: AutopilotControllerState = createAutopilotControllerState(),
): AutopilotCommandResult {
  const nextControllerState = cloneAutopilotControllerState(controllerState);
  if (!ap) return { commands: {}, controllerState: nextControllerState };

  const routeStatusForTruth = routeStatus
    ?? (flightPlan ? computeRouteStatus(state, flightPlan, activeLegIndex ?? null) : null);
  const truth = deriveEffectiveAutoflightTruth(ap, {
    aircraft: state,
    flightPlan: flightPlan ?? null,
    routeStatus: routeStatusForTruth,
  });
  if (truth.autopilotStatus === 'OFF' && !hasThrustGuidance(truth)) {
    return { commands: {}, controllerState: nextControllerState };
  }

  const effectiveAp = apWithEffectiveTruth(ap, truth);
  const tgts = resolveAutopilotTargets(state, effectiveAp, flightPlan, activeLegIndex, routeStatusForTruth);
  return computeAutopilotCommandsWithControllerState(
    state,
    effectiveAp,
    tgts.targetHeadingRad,
    tgts.targetAltFt,
    tgts.targetSpeedKt,
    dt,
    tgts.targetVerticalSpeedFpm,
    tgts.targetN1Percent,
    wind,
    nextControllerState,
    tgts.targetPitchDeg,
    tgts.targetThrottle,
  );
}

// ── Controls composition ────────────────────────────────────────────────

export function composeEffectiveControls(
  pilotInputs: ControlInputs,
  apCommands: AutopilotCommands = {},
  apActive = false,
  manualOverride = false,
): ControlInputs {
  const effective: ControlInputs = { ...pilotInputs };
  if (!apActive || manualOverride) return effective;

  if (apCommands.elevator !== undefined) effective.elevator = clampSigned(apCommands.elevator);
  if (apCommands.aileron !== undefined) effective.aileron = clampSigned(apCommands.aileron);
  if (apCommands.throttle1 !== undefined) effective.throttle1 = clamp01(apCommands.throttle1);
  if (apCommands.throttle2 !== undefined) effective.throttle2 = clamp01(apCommands.throttle2);

  return effective;
}
