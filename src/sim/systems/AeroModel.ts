export interface AeroModel {
  cl0: number;
  clAlpha: number;
  flapClIncrements: number[];
  flapDetents: number[];
  cd0: number;
  cdFlap: number;
  cdGear: number;
  cdSpeedBrake: number;
  oswaldEfficiency: number;
  cm0: number;
  cmAlpha: number;
  cmElevator: number;
  cmq: number;
  cmFlap: number;
  clBeta: number;
  clAileron: number;
  clp: number;
  cnBeta: number;
  cnRudder: number;
  cnr: number;
}

export const B737_AERO: AeroModel = {
  // Tuned for the current playable 737-like envelope: positive cruise AoA,
  // less self-flying lift at zero AoA, stronger dirty-configuration drag, and
  // enough neutral pitch trim that releasing rotate does not dump the nose.
  cl0: 0.35,
  clAlpha: 5.73,
  flapClIncrements: [0, 0.4, 0.4, 0.4, 0.7, 0.7, 1.0, 1.3, 1.6],
  flapDetents: [0, 1, 2, 5, 10, 15, 25, 30, 40],
  cd0: 0.018,
  cdFlap: 0.025,
  cdGear: 0.06,
  cdSpeedBrake: 0.04,
  oswaldEfficiency: 0.8,
  cm0: 0.08,
  cmAlpha: -1.2,
  cmElevator: -1.2,
  cmq: -36,
  cmFlap: 0.005,
  clBeta: -0.08,
  clAileron: 0.06,
  clp: -0.4,
  cnBeta: 0.12,
  cnRudder: -0.07,
  cnr: -0.15,
};
