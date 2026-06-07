import { B737_800_FDM } from '../data/aircraft/b737-800-fdm.v1';

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

export interface ElevatorAuthorityModel {
  maxDeflectionRad: number;
  noseUpFadeStartRad: number;
  noseUpFadeEndRad: number;
}

export interface StabilizerTrimModel {
  minUnits: number;
  maxUnits: number;
  cmPerUnit: number;
}

export interface SideForceModel {
  cyBeta: number;
  cyRudder: number;
}

export interface GroundEffectModel {
  liftReliefFactor: number;
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
  elevator: ElevatorAuthorityModel;
  stabilizerTrim: StabilizerTrimModel;
  sideForce: SideForceModel;
  groundEffect: GroundEffectModel;
}

export const B737_AERO: AeroModel = B737_800_FDM.aero;
