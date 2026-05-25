import type { AircraftState, ControlInputs } from '../types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';

// PID state (module-level — one set of integrators)
const rollIntegral = { value: 0, prevError: 0 };
const pitchIntegral = { value: 0, prevError: 0 };
const thrustIntegral = { value: 0, prevError: 0 };

function pid(pid: { value: number; prevError: number }, error: number, kp: number, ki: number, kd: number, dt: number): number {
  pid.value += error * dt;
  const deriv = (error - pid.prevError) / Math.max(dt, 0.001);
  pid.prevError = error;
  return kp * error + ki * pid.value + kd * deriv;
}

export function resetAutopilotPID(): void {
  rollIntegral.value = 0;
  rollIntegral.prevError = 0;
  pitchIntegral.value = 0;
  pitchIntegral.prevError = 0;
  thrustIntegral.value = 0;
  thrustIntegral.prevError = 0;
}

export function updateAutopilot(
  state: AircraftState,
  inputs: ControlInputs,
  apState: AutopilotState,
  targetHeadingRad: number,
  targetAltFt: number,
  targetSpeedKt: number,
  dt: number,
): void {
  const t = apState.truth;

  // ── Lateral ──
  if (t.lateralActive === 'HDG_SEL' || t.lateralActive === 'LNAV') {
    let hdgErr = targetHeadingRad - state.attitude.psi;
    while (hdgErr > Math.PI) hdgErr -= 2 * Math.PI;
    while (hdgErr < -Math.PI) hdgErr += 2 * Math.PI;
    inputs.aileron = pid(rollIntegral, hdgErr, 0.03, 0.002, 0.01, dt);
    inputs.aileron = Math.max(-1, Math.min(1, inputs.aileron));
  }

  // ── Vertical ──
  if (t.verticalActive === 'ALT_HOLD') {
    const altErr = state.position.alt - targetAltFt;
    inputs.elevator = pid(pitchIntegral, altErr, 0.00004, 0.000001, 0.00001, dt);
    inputs.elevator = Math.max(-1, Math.min(1, inputs.elevator));
  }

  // ── Thrust ──
  if (t.thrustActive === 'SPEED') {
    const tas = Math.sqrt(state.velocity.u ** 2 + state.velocity.v ** 2 + state.velocity.w ** 2) * 1.944; // m/s → kts
    const spdErr = targetSpeedKt - tas;
    const thr = pid(thrustIntegral, spdErr, 0.002, 0.00005, 0.0005, dt);
    const clamped = Math.max(0, Math.min(1, thr));
    inputs.throttle1 = clamped;
    inputs.throttle2 = clamped;
  }
}
