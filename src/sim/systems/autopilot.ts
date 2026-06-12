import type { AircraftState, AutopilotCommands, ControlInputs } from '../types';
import type { AutoflightTruthState, AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import {
  computeRouteStatus,
  routeStatusToNavOutput,
  type NavOutput,
  type RouteStatusSnapshot,
} from './navigation';
import { computeVNAV } from './vnav';
import { bodyToNed } from '../physics/frames';
import { deriveEffectiveAutoflightTruth } from './effectiveAutoflightTruth';

// ── Module-level PID state ──────────────────────────────────────────────

const pitchPid = { value: 0, prevError: 0 };
const rollPid = { value: 0, prevError: 0 };
const thrustPid = { value: 0, prevError: 0 };
const pitchTargetIntegral = { value: 0, prevError: 0 };
let throttleLimited = 0; // rate-limited throttle output

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
function currentTasKt(state: AircraftState): number {
  return Math.sqrt(state.velocity.u ** 2 + state.velocity.v ** 2 + state.velocity.w ** 2) * 1.944;
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
  pitchPid.value = 0; pitchPid.prevError = 0;
  rollPid.value = 0; rollPid.prevError = 0;
  thrustPid.value = 0; thrustPid.prevError = 0;
  pitchTargetIntegral.value = 0; pitchTargetIntegral.prevError = 0;
  throttleLimited = 0;
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

export function computeN1TargetPercent(state: AircraftState): number {
  if (state.flightPhase === 'TAKEOFF') return 92;
  if (state.flightPhase === 'CLIMB') return 88;
  if (state.flightPhase === 'CRUISE' || state.position.alt > 18_000) return 72;
  if (state.flightPhase === 'DESCENT' || state.flightPhase === 'APPROACH' || state.flightPhase === 'LANDED') return 55;
  return 20;
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
  let hdg = state.attitude.psi;
  let alt = state.position.alt;
  const selSpd = finiteOrUndefined(ap.boeing.speed);
  let spd = selSpd ?? 250;
  let vs: number | undefined;
  let n1: number | undefined;
  let navCache: NavOutput | null | undefined;

  const nav = (): NavOutput | null => {
    if (navCache !== undefined) return navCache;
    if (routeStatusOverride) {
      navCache = routeStatusToNavOutput(routeStatusOverride, { maxInterceptDeg: 25 });
      return navCache;
    }

    const idx = typeof activeLegIndex === 'number' && Number.isFinite(activeLegIndex) && activeLegIndex >= 0 ? activeLegIndex : null;
    if (!flightPlan || idx === null) { navCache = null; return null; }
    navCache = routeStatusToNavOutput(computeRouteStatus(state, flightPlan, idx), { maxInterceptDeg: 25 });
    return navCache;
  };

  if (ap.truth.lateralActive === 'HDG_SEL') {
    hdg = (finiteOrUndefined(ap.boeing.heading) ?? 0) * Math.PI / 180;
  }
  if (ap.truth.verticalActive === 'ALT_HOLD') {
    const sa = finiteOrUndefined(ap.boeing.altitude);
    if (sa !== undefined && sa > 0) alt = sa;
  }
  if (ap.truth.verticalActive === 'VS') {
    vs = finiteOrUndefined(ap.boeing.verticalSpeed) ?? 0;
    // Altitude capture: blend into ALT_HOLD near the MCP altitude window
    const sa = finiteOrUndefined(ap.boeing.altitude);
    if (sa !== undefined && sa > 0 && vs !== undefined) {
      const d = sa - state.position.alt;
      const windowFt = 500;
      if (Math.abs(d) < windowFt * 2 && ((vs > 0 && d <= windowFt) || (vs < 0 && d >= -windowFt))) {
        vs = vs * Math.max(0, Math.abs(d) / windowFt);
      }
    }
  }
  if (ap.truth.lateralActive === 'LNAV') {
    const n = nav();
    if (n) hdg = n.desiredTrack;
  }

  // ── VNAV: expose targets from the active route leg ──
  const isVnav = ap.truth.verticalActive === 'VNAV' || ap.truth.verticalActive === 'VNAV_PTH' || ap.truth.verticalActive === 'ALT*';
  if (isVnav && flightPlan) {
    const n = nav();
    if (n) {
      const v = computeVNAV(state, flightPlan, n);
      if (v.available) {
        if (v.altitudeConstraint) {
          alt = v.targetAlt;
          vs = v.targetVs;
        }
        if (v.speedConstraint && selSpd === undefined && ap.truth.thrustActive === 'SPEED') {
          spd = v.targetSpeedKt ?? spd;
        }
      }
    }
  }
  if (ap.truth.thrustActive === 'N1' && ap.boeing.autothrottleArm) {
    n1 = computeN1TargetPercent(state);
  }

  return { targetHeadingRad: hdg, targetAltFt: alt, targetSpeedKt: spd, targetVerticalSpeedFpm: vs, targetN1Percent: n1 };
}

// ── Inner loops: attitude control ───────────────────────────────────────

/** Pitch inner loop: holds a target pitch angle via elevator. */
function pitchHold(targetPitchDeg: number, state: AircraftState, dt: number): number {
  const currentPitchDeg = radToDeg(state.attitude.theta);
  const err = targetPitchDeg - currentPitchDeg;
  // elevator convention: negative = nose-up, positive = nose-down
  return clampSigned(pid(pitchPid, -err, 0.30, 0.08, 0.10, dt, 4, 4));
}

/** Roll inner loop: holds a target bank angle via aileron. */
function bankHold(targetBankDeg: number, state: AircraftState, dt: number): number {
  const currentBankDeg = radToDeg(state.attitude.phi);
  const err = targetBankDeg - currentBankDeg;
  return clampSigned(pid(rollPid, err, 0.06, 0.01, 0.03, dt, 2));
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
function altitudeToPitch(targetAltFt: number, state: AircraftState, dt: number): number {
  const err = targetAltFt - state.position.alt;
  // P=0.004: 250ft error → 1° pitch adjustment
  const pitchAdjustDeg = pid(pitchTargetIntegral, err, 0.004, 0.0008, 0, dt, 4);
  return clamp(pitchAdjustDeg, -10, 15);
}

/** VS outer loop: adjusts pitch to track vertical speed. */
function vsToPitch(targetVerticalSpeedFpm: number, state: AircraftState, dt: number): number {
  const err = targetVerticalSpeedFpm - currentVsFpm(state);
  const pitchAdjustDeg = pid(pitchTargetIntegral, err, 0.00015, 0.00003, 0, dt, 2);
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
): AutopilotCommands {
  if (!isAutopilotEngaged(ap)) return {};

  const t = ap.truth;
  const cmd: AutopilotCommands = {};

  // ── Pitch target ──
  let pitchTargetDeg = radToDeg(state.attitude.theta); // default: hold current pitch

  if (hasVerticalGuidance(t)) {
    if (t.verticalActive === 'ALT_HOLD') {
      pitchTargetDeg = altitudeToPitch(targetAltFt, state, dt);
    } else if (t.verticalActive === 'VS' || t.verticalActive === 'VNAV' || t.verticalActive === 'VNAV_PTH' || t.verticalActive === 'ALT*') {
      const vs = finiteOrUndefined(targetVerticalSpeedFpm) ?? finiteOrUndefined(ap.boeing.verticalSpeed) ?? 0;
      pitchTargetDeg = vsToPitch(vs, state, dt);
    }

    pitchTargetDeg = clamp(pitchTargetDeg, PITCH_MIN_DEG, PITCH_MAX_DEG);
    cmd.elevator = pitchHold(pitchTargetDeg, state, dt);
  }

  // ── Bank target ──
  if (hasLateralGuidance(t)) {
    let bankTargetDeg = 0; // default: wings level
    if (t.lateralActive === 'HDG_SEL' || t.lateralActive === 'LNAV') {
      bankTargetDeg = headingToBank(targetHeadingRad, state);
    }
    cmd.aileron = bankHold(bankTargetDeg, state, dt);
  }

  // ── Thrust ──
  if (t.thrustActive === 'SPEED') {
    const tasKt = currentTasKt(state);
    const spdErr = targetSpeedKt - tasKt;
    const altFt = state.position.alt;
    const deficit = targetSpeedKt - tasKt;
    const vsFpm = currentVsFpm(state);
    const aboveTarget = t.verticalActive === 'ALT_HOLD' && state.position.alt > targetAltFt + 200;

    const thr = pid(thrustPid, spdErr, aboveTarget ? 0.003 : 0.008, aboveTarget ? 0.0005 : 0.002, 0.003, dt, 5);

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
    throttleLimited = clamp(raw, throttleLimited - maxDelta, throttleLimited + maxDelta);
    cmd.throttle1 = throttleLimited;
    cmd.throttle2 = throttleLimited;
  } else if (t.thrustActive === 'N1' && ap.boeing.autothrottleArm && targetN1Percent !== undefined) {
    const avgN1 = (state.engines[0].n1 + state.engines[1].n1) / 2;
    const base = throttleForN1(targetN1Percent);
    const correction = clamp((targetN1Percent - avgN1) * 0.01, -0.15, 0.15);
    cmd.throttle1 = clamp01(base + correction);
    cmd.throttle2 = cmd.throttle1;
  }

  return cmd;
}

// ── Convenience wrapper ─────────────────────────────────────────────────

export function computeAutopilotCommandsForState(
  state: AircraftState,
  ap: AutopilotState | null | undefined,
  flightPlan: FlightPlan | null | undefined,
  dt: number,
  activeLegIndex?: number | null,
  routeStatus?: RouteStatusSnapshot | null,
): AutopilotCommands {
  if (!ap) return {};

  const routeStatusForTruth = routeStatus
    ?? (flightPlan ? computeRouteStatus(state, flightPlan, activeLegIndex ?? null) : null);
  const truth = deriveEffectiveAutoflightTruth(ap, {
    aircraft: state,
    flightPlan: flightPlan ?? null,
    routeStatus: routeStatusForTruth,
  });
  if (truth.autopilotStatus === 'OFF') return {};

  const effectiveAp = apWithEffectiveTruth(ap, truth);
  const tgts = resolveAutopilotTargets(state, effectiveAp, flightPlan, activeLegIndex, routeStatusForTruth);
  return computeAutopilotCommands(state, effectiveAp, tgts.targetHeadingRad, tgts.targetAltFt, tgts.targetSpeedKt, dt, tgts.targetVerticalSpeedFpm, tgts.targetN1Percent);
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