export interface FlapPolar {
  detent: number;
  alphaZeroLiftRad: number;
  clAlpha: number;
  clMax: number;
  cd0: number;
  k: number;
  deltaCm: number;
  stallDragRise: number;
}

export interface AeroModel {
  flapPolars: FlapPolar[];
  gearCd: number;
  speedBrakeCd: number;
  cm0: number;
  cmAlpha: number;
  cmElevator: number;
  cmq: number;
  clBeta: number;
  clAileron: number;
  clp: number;
  cnBeta: number;
  cnRudder: number;
  cnr: number;
}

export const B737_AERO: AeroModel = {
  // Flap polars are intentionally broad B737-ish values, not certification data.
  // They give the physics a finite CLmax, more drag with high-lift devices, and
  // flap-specific pitch moments so takeoff/climb tuning has real envelopes.
  flapPolars: [
    { detent: 0, alphaZeroLiftRad: -0.065, clAlpha: 5.5, clMax: 1.55, cd0: 0.020, k: 0.045, deltaCm: 0.0, stallDragRise: 0.55 },
    { detent: 1, alphaZeroLiftRad: -0.075, clAlpha: 5.55, clMax: 1.65, cd0: 0.022, k: 0.047, deltaCm: -0.005, stallDragRise: 0.60 },
    { detent: 5, alphaZeroLiftRad: -0.140, clAlpha: 5.45, clMax: 2.05, cd0: 0.030, k: 0.052, deltaCm: -0.020, stallDragRise: 0.75 },
    { detent: 15, alphaZeroLiftRad: -0.160, clAlpha: 5.30, clMax: 2.25, cd0: 0.058, k: 0.072, deltaCm: -0.060, stallDragRise: 0.95 },
    { detent: 30, alphaZeroLiftRad: -0.190, clAlpha: 5.10, clMax: 2.45, cd0: 0.095, k: 0.095, deltaCm: -0.110, stallDragRise: 1.20 },
    { detent: 40, alphaZeroLiftRad: -0.200, clAlpha: 5.00, clMax: 2.55, cd0: 0.125, k: 0.115, deltaCm: -0.145, stallDragRise: 1.35 },
  ],
  gearCd: 0.06,
  speedBrakeCd: 0.04,
  cm0: 0.08,
  cmAlpha: -1.2,
  cmElevator: -1.2,
  cmq: -36,
  clBeta: -0.08,
  clAileron: 0.06,
  clp: -0.4,
  cnBeta: 0.12,
  cnRudder: -0.07,
  cnr: -0.15,
};
