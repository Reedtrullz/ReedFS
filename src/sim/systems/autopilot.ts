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
    || truth.verticalActive === 'ALT*';
}

function hasLateralGuidance(truth: AutoflightTruthState): boolean {
  return truth.lateralActive === 'HDG_SEL' || truth.lateralActive === 'LNAV';
}

function hasThrustGuidance(truth: AutoflightTruthState): boolean {
  return truth.thrustActive === 'SPEED' || truth.thrustActive === 'N1';
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
function vsToPitch(controllerState: AutopilotControllerState, targetVerticalSpeedFpm: number, state: AircraftState, dt: number): number {
  const err = targetVerticalSpeedFpm - currentVsFpm(state);
  const pitchAdjustDeg = pid(controllerState.pitchTargetIntegral, err, 0.00015, 0.00003, 0, dt, 2);
  return clamp(pitchAdjustDeg, -8, 15);
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
      pitchTargetDeg = vsToPitch(nextControllerState, vs, state, dt);
    } else if (t.verticalActive === 'VNAV' || t.verticalActive === 'VNAV_PTH' || t.verticalActive === 'ALT*') {
      const vs = finiteOrUndefined(targetVerticalSpeedFpm);
      if (vs !== undefined) pitchTargetDeg = vsToPitch(nextControllerState, vs, state, dt);
    }

    if (pitchTargetDeg !== undefined) {
      pitchTargetDeg = clamp(pitchTargetDeg, PITCH_MIN_DEG, PITCH_MAX_DEG);
      cmd.elevator = pitchHold(nextControllerState, pitchTargetDeg, state, dt);
    }
  }

  // ── Bank target ──
  if (autopilotEngaged && hasLateralGuidance(t)) {
    let bankTargetDeg = 0; // default: wings level
    if (t.lateralActive === 'HDG_SEL' || t.lateralActive === 'LNAV') {
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
    const aboveTarget = t.verticalActive === 'ALT_HOLD' && state.position.alt > targetAltFt + 200;

    const thr = pid(nextControllerState.thrustPid, spdErr, aboveTarget ? 0.003 : 0.008, aboveTarget ? 0.0005 : 0.002, 0.003, dt, 5);

    let minT: number;

    if (state.ground.weightOnWheels) {
      minT = 0;
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
    } else if (state.flightPhase === 'CLIMB') {
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