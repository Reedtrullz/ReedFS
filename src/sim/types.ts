// ── 6-DOF State Vector ──

import { eulerToQuat, type Quaternion } from './physics/quaternion';
import b737Data from './data/b737.json';

export interface GeoPosition {
  lat: number; // decimal degrees
  lon: number;
  alt: number; // feet MSL
}

export interface BodyVelocity {
  u: number; // m/s, forward (body x-axis)
  v: number; // m/s, lateral (body y-axis)
  w: number; // m/s, vertical (body z-axis, positive down)
}

export interface Attitude {
  phi: number;   // roll angle, radians (+ right wing down)
  theta: number; // pitch angle, radians (+ nose up)
  psi: number;   // yaw/heading angle, radians (0 = north)
}

export interface AngularVelocity {
  p: number; // roll rate, rad/s
  q: number; // pitch rate, rad/s
  r: number; // yaw rate, rad/s
}

// ── Derived (computed from state) ──

export interface DerivedState {
  ias: number;     // indicated airspeed, knots
  tas: number;     // true airspeed, knots
  gs: number;      // ground speed, knots
  mach: number;
  vs: number;      // vertical speed, ft/min
  aoa: number;     // angle of attack, radians
  beta: number;    // sideslip angle, radians
}

// ── Ground Contact State ──

export type GroundContactType = 'none' | 'gear' | 'belly' | 'crashed';
export type GearStationId = 'nose' | 'leftMain' | 'rightMain';

export interface BodyStationPosition {
  x: number; // m, body +x forward
  y: number; // m, body +y right
  z: number; // m, body +z down
}

export interface GearStationState {
  id: GearStationId;
  label: string;
  positionBodyM: BodyStationPosition;
  wheelRadiusM: number;
  strutRestLengthM: number;
  maxCompressionM: number;
  springStiffnessNPerM: number;
  staticLoadFraction: number;
  compressionM: number;
  normalForceN: number;
  weightOnWheel: boolean;
  brakeCapable: boolean;
  steerable: boolean;
  steeringAngleRad: number;
}

export interface GroundState {
  aglFt: number;
  groundAltFt: number;
  weightOnWheels: boolean;
  normalForceN: number;
  onRunway: boolean;
  contact: GroundContactType;
  gearStations: GearStationState[];
}

// ── Control Inputs ──

export interface ControlInputs {
  elevator: number;   // -1 (full nose-up) to +1 (full nose-down)
  aileron: number;    // -1 (full left roll) to +1 (full right roll)
  rudder: number;     // -1 (full left) to +1 (full right)
  throttle1: number;  // 0 (idle) to 1 (TOGA)
  throttle2: number;
  flapLever: number;  // detent: 0, 1, 2, 5, 10, 15, 25, 30, 40
  gearLever: 'UP' | 'DOWN';
  spoilers: number;   // 0 to 1
  brake: number;      // 0 to 1
}

export type AutopilotCommands = Partial<Pick<ControlInputs, 'elevator' | 'aileron' | 'throttle1' | 'throttle2'>>;

// ── Engine State ──

export interface EngineState {
  n1: number;        // % (0-110)
  n2: number;        // % (0-110)
  egt: number;       // °C
  fuelFlow: number;  // kg/hr per engine
  thrust: number;    // N
  running: boolean;
}

// ── Electrical System ──

export interface ElectricalState {
  gen1Online: boolean;
  gen2Online: boolean;
  acBusPowered: boolean;
  batteryVolts: number;
}

// ── Hydraulic System ──

export interface HydraulicState {
  systemAPsi: number;
  systemBPsi: number;
  standbyPsi: number;
}

// ── Fuel System ──

export interface FuelState {
  totalFuel: number;
  fuelFlowTotal: number;
  centerTank: number;
  leftTank: number;
  rightTank: number;
}

// ── Aircraft Config ──

export interface AircraftConfig {
  flapSetting: number;
  gearDown: boolean;
  spoilersArmed: boolean;
  spoilersDeployed: boolean;
  speedBrake: number; // 0-1
  stabilizerTrimUnits: number; // 0-15, increasing nose-up stabilizer trim
}

// ── Full Aircraft State ──

export type FlightPhase = 'PARKED' | 'TAXI' | 'TAKEOFF' | 'CLIMB' | 'CRUISE' | 'DESCENT' | 'APPROACH' | 'LANDED';

export interface AircraftState {
  position: GeoPosition;
  velocity: BodyVelocity;
  attitude: Attitude;
  quaternion: Quaternion;
  angularVel: AngularVelocity;
  config: AircraftConfig;
  engines: [EngineState, EngineState];
  fuel: FuelState;
  electrical: ElectricalState;
  hydraulic: HydraulicState;
  zeroFuelWeight: number;
  zeroFuelCg: number;
  grossWeight: number;
  payloadWeight: number;
  cg: number; // % MAC
  ground: GroundState;
  simTime: number; // ms
  timeOfDay: number; // hours (0-24)
  flightPhase: FlightPhase;
}

// ── Aircraft Spec (737-800 approx) ──

export interface AircraftSpec {
  emptyWeight: number;
  maxFuel: number;
  maxTakeoffWeight: number;
  wingArea: number;       // m²
  wingSpan: number;        // m
  meanChord: number;       // m
  aerodynamicCenterPercentMac: number; // % MAC, reference point for CG pitch moments
  maxThrust: number;       // lbf per engine, sea level static
  engineCount: number;
  vStall: number;          // knots, clean
  maxFlaps: number;
  cgLimits: [number, number]; // % MAC
  fuelCapacity: { center: number; left: number; right: number; }; // kg
  // Moments of inertia (kg·m²) — approximate for 737-800
  ixx: number;
  iyy: number;
  izz: number;
  ixz: number;
}

export const B737_800_SPEC: AircraftSpec = {
  emptyWeight: 41413,
  maxFuel: 20894,
  maxTakeoffWeight: 79015,
  wingArea: 124.6,
  wingSpan: 35.8,
  meanChord: 3.96,
  aerodynamicCenterPercentMac: 25,
  maxThrust: 27300,
  engineCount: 2,
  vStall: 120,
  maxFlaps: 40,
  cgLimits: [7, 30],
  fuelCapacity: { center: 13066, left: 3914, right: 3914 },
  ixx: 1340000,
  iyy: 3450000,
  izz: 4610000,
  ixz: 40000,
};

const B737_GEAR_STATION_BASE: Omit<GearStationState, 'compressionM' | 'normalForceN' | 'weightOnWheel' | 'steeringAngleRad'>[] = [
  {
    id: 'nose',
    label: 'Nose gear',
    positionBodyM: { x: 15.2, y: 0, z: 2.25 },
    wheelRadiusM: 0.43,
    strutRestLengthM: 1.05,
    maxCompressionM: 0.32,
    springStiffnessNPerM: 400_000,
    staticLoadFraction: 0.10,
    brakeCapable: false,
    steerable: true,
  },
  {
    id: 'leftMain',
    label: 'Left main gear',
    positionBodyM: { x: -2.8, y: -3.15, z: 2.45 },
    wheelRadiusM: 0.58,
    strutRestLengthM: 1.25,
    maxCompressionM: 0.50,
    springStiffnessNPerM: 800_000,
    staticLoadFraction: 0.45,
    brakeCapable: true,
    steerable: false,
  },
  {
    id: 'rightMain',
    label: 'Right main gear',
    positionBodyM: { x: -2.8, y: 3.15, z: 2.45 },
    wheelRadiusM: 0.58,
    strutRestLengthM: 1.25,
    maxCompressionM: 0.50,
    springStiffnessNPerM: 800_000,
    staticLoadFraction: 0.45,
    brakeCapable: true,
    steerable: false,
  },
];

function gearCompressionM(station: Omit<GearStationState, 'compressionM' | 'normalForceN' | 'weightOnWheel' | 'steeringAngleRad'>, normalForceN: number): number {
  if (normalForceN <= 0) return 0;
  return Math.max(0, Math.min(station.maxCompressionM, normalForceN / station.springStiffnessNPerM));
}

export function createB737GearStations(totalNormalForceN = 0, weightOnWheel = false): GearStationState[] {
  return B737_GEAR_STATION_BASE.map((station) => {
    const normalForceN = weightOnWheel ? totalNormalForceN * station.staticLoadFraction : 0;
    return {
      ...station,
      compressionM: gearCompressionM(station, normalForceN),
      normalForceN,
      weightOnWheel,
      steeringAngleRad: 0,
    };
  });
}

export function createInitialState(spec: AircraftSpec): AircraftState {
  const attitude: Attitude = { phi: 0, theta: 0, psi: Math.PI };
  const initialAltFt = 432;
  const zeroFuelWeight = spec.emptyWeight;
  const grossWeight = zeroFuelWeight + spec.maxFuel;

  return {
    position: { lat: 47.45, lon: -122.31, alt: initialAltFt },
    velocity: { u: 0, v: 0, w: 0 },
    attitude, // facing south (180°)
    quaternion: eulerToQuat(attitude.phi, attitude.theta, attitude.psi),
    angularVel: { p: 0, q: 0, r: 0 },
    config: { flapSetting: 0, gearDown: true, spoilersArmed: false, spoilersDeployed: false, speedBrake: 0, stabilizerTrimUnits: 0 },
    engines: [
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
    ],
    fuel: { totalFuel: spec.maxFuel, fuelFlowTotal: 0, centerTank: spec.fuelCapacity.center, leftTank: spec.fuelCapacity.left, rightTank: spec.fuelCapacity.right },
    electrical: { gen1Online: false, gen2Online: false, acBusPowered: false, batteryVolts: 28 },
    hydraulic: { systemAPsi: 0, systemBPsi: 0, standbyPsi: 0 },
    zeroFuelWeight,
    zeroFuelCg: 25,
    grossWeight,
    payloadWeight: 0,
    cg: 25,
    ground: {
      aglFt: 0,
      groundAltFt: initialAltFt,
      weightOnWheels: true,
      normalForceN: grossWeight * 9.80665,
      onRunway: true,
      contact: 'gear',
      gearStations: createB737GearStations(grossWeight * 9.80665, true),
    },
    simTime: 0,
    timeOfDay: 12,
    flightPhase: 'PARKED',
  };
}

export function loadAircraftSpec(): AircraftSpec {
  const d = b737Data;
  return {
    emptyWeight: d.mass.emptyWeight,
    maxFuel: d.mass.maxFuel,
    maxTakeoffWeight: d.mass.maxTakeoffWeight,
    wingArea: d.geometry.wingArea,
    wingSpan: d.geometry.wingSpan,
    meanChord: d.geometry.meanChord,
    aerodynamicCenterPercentMac: B737_800_SPEC.aerodynamicCenterPercentMac,
    maxThrust: d.propulsion.maxThrust,
    engineCount: d.propulsion.engineCount,
    vStall: d.performance.stallSpeedClean,
    maxFlaps: d.performance.maxFlaps,
    cgLimits: d.mass.cgLimits as [number, number],
    fuelCapacity: d.mass.fuelCapacity as { center: number; left: number; right: number },
    ixx: d.inertia.ixx,
    iyy: d.inertia.iyy,
    izz: d.inertia.izz,
    ixz: d.inertia.ixz,
  };
}
