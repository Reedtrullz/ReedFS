import type { AircraftState, BodyVelocity } from '../../types';
import { isaAtAltitude } from '../atmosphere';
import { ktToMs, msToKt } from '../units';
import { trueAirspeedFromCasMs } from '../airData';

export function tasKtForIasAtAltitude(iasKt: number, altitudeFt: number): number {
  const tasMs = trueAirspeedFromCasMs(ktToMs(iasKt), isaAtAltitude(altitudeFt));
  if (tasMs === null) throw new Error("IAS fixture outside supported subsonic CAS domain");
  return msToKt(tasMs);
}

export function bodyVelocityForIasAtAltitude(
  iasKt: number,
  altitudeFt: number,
  angleOfAttackRad = 0,
  betaRad = 0,
): BodyVelocity {
  const tasMs = ktToMs(tasKtForIasAtAltitude(iasKt, altitudeFt));
  const lateralMps = tasMs * Math.sin(betaRad);
  const longitudinalPlaneMps = tasMs * Math.cos(betaRad);

  return {
    u: longitudinalPlaneMps * Math.cos(angleOfAttackRad),
    v: lateralMps,
    w: longitudinalPlaneMps * Math.sin(angleOfAttackRad),
  };
}

export function applyIasFlightCondition(
  state: AircraftState,
  options: {
    iasKt: number;
    altitudeFt: number;
    angleOfAttackRad?: number;
    betaRad?: number;
    flapSetting?: number;
    gearDown?: boolean;
    speedBrake?: number;
  },
): AircraftState {
  state.position.alt = options.altitudeFt;
  state.velocity = bodyVelocityForIasAtAltitude(
    options.iasKt,
    options.altitudeFt,
    options.angleOfAttackRad ?? 0,
    options.betaRad ?? 0,
  );
  if (options.flapSetting !== undefined) state.config.flapSetting = options.flapSetting;
  if (options.gearDown !== undefined) {
    state.config.gearDown = options.gearDown;
    state.config.gearPosition = options.gearDown ? 1 : 0;
  }
  if (options.speedBrake !== undefined) state.config.speedBrake = options.speedBrake;
  return state;
}
