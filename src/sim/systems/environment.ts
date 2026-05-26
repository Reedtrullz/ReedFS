import { nedToBody, type NedVelocity } from '../physics/frames';
import type { AircraftState, BodyVelocity } from '../types';
import type { WindInfo } from '../weather';

const KNOT_TO_MPS = 0.514444;

function addNed(a: NedVelocity, b: NedVelocity): NedVelocity {
  return {
    north: a.north + b.north,
    east: a.east + b.east,
    down: a.down + b.down,
  };
}

function seededWave(seed: number, simTimeMs: number, channel: number): number {
  const t = simTimeMs / 1000;
  const phase = seed * 12.9898 + channel * 78.233;
  return Math.sin(t * 0.73 + phase) * 0.6 + Math.sin(t * 1.37 + phase * 0.37) * 0.4;
}

export function windToNed(wind: WindInfo): NedVelocity {
  if (wind.speed < 0.5) return { north: 0, east: 0, down: 0 };

  const windDirRad = (wind.dir * Math.PI) / 180;
  const windMs = wind.speed * KNOT_TO_MPS;

  return {
    north: -windMs * Math.cos(windDirRad),
    east: -windMs * Math.sin(windDirRad),
    down: 0,
  };
}

export function computeGustNed(wind: WindInfo, simTimeMs: number): NedVelocity {
  const gustSpeed = wind.gustSpeed ?? 0;
  const baseSpeed = Math.max(0, wind.speed);
  const gustDeltaMps = Math.max(0, gustSpeed - baseSpeed) * KNOT_TO_MPS;
  if (gustDeltaMps <= 0) return { north: 0, east: 0, down: 0 };

  const seed = wind.gustSeed ?? 1;
  const windDirRad = (wind.dir * Math.PI) / 180;
  const alongUnitNorth = -Math.cos(windDirRad);
  const alongUnitEast = -Math.sin(windDirRad);
  const lateralUnitNorth = -alongUnitEast;
  const lateralUnitEast = alongUnitNorth;
  const alongGustMps = gustDeltaMps * (0.5 + 0.5 * seededWave(seed, simTimeMs, 0));
  const lateralGustMps = gustDeltaMps * 0.15 * seededWave(seed, simTimeMs, 1);

  return {
    north: alongUnitNorth * alongGustMps + lateralUnitNorth * lateralGustMps,
    east: alongUnitEast * alongGustMps + lateralUnitEast * lateralGustMps,
    down: 0,
  };
}

export function computeAirRelativeVelocity(state: AircraftState, wind: WindInfo | null): BodyVelocity {
  if (!wind || (wind.speed < 0.5 && !(wind.gustSpeed && wind.gustSpeed >= 0.5))) return { ...state.velocity };

  const windBody = nedToBody(addNed(windToNed(wind), computeGustNed(wind, state.simTime)), state.attitude);
  return {
    u: state.velocity.u - windBody.u,
    v: state.velocity.v - windBody.v,
    w: state.velocity.w - windBody.w,
  };
}
