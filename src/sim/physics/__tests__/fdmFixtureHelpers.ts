import type { AircraftState, BodyVelocity } from '../../types';
import { isaAtAltitude } from '../atmosphere';
import { ktToMs } from '../units';

const SEA_LEVEL_DENSITY_KG_M3 = 1.225;

export function tasKtForIasAtAltitude(iasKt: number, altitudeFt: number): number {
  const rhoRatio = isaAtAltitude(altitudeFt).density / SEA_LEVEL_DENSITY_KG_M3;
  return iasKt / Math.sqrt(Math.max(0.05, rhoRatio));
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
  if (options.gearDown !== undefined) state.config.gearDown = options.gearDown;
  if (options.speedBrake !== undefined) state.config.speedBrake = options.speedBrake;
  return state;
}
