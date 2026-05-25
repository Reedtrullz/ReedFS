// ── 6-DOF State Vector ──

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

// ── Engine State ──

export interface EngineState {
  n1: number;        // % (0-110)
  n2: number;        // % (0-110)
  egt: number;       // °C
  fuelFlow: number;  // kg/hr per engine
  thrust: number;    // lbf
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
}

// ── Full Aircraft State ──

export type FlightPhase = 'PARKED' | 'TAXI' | 'TAKEOFF' | 'CLIMB' | 'CRUISE' | 'DESCENT' | 'APPROACH' | 'LANDED';

export interface AircraftState {
  position: GeoPosition;
  velocity: BodyVelocity;
  attitude: Attitude;
  angularVel: AngularVelocity;
  config: AircraftConfig;
  engines: [EngineState, EngineState];
  fuel: FuelState;
  electrical: ElectricalState;
  hydraulic: HydraulicState;
  grossWeight: number;
  cg: number; // % MAC
  simTime: number; // ms
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

export function createInitialState(spec: AircraftSpec): AircraftState {
  return {
    position: { lat: 47.45, lon: -122.31, alt: 432 },
    velocity: { u: 0, v: 0, w: 0 },
    attitude: { phi: 0, theta: 0, psi: Math.PI }, // facing south (180°)
    angularVel: { p: 0, q: 0, r: 0 },
    config: { flapSetting: 0, gearDown: true, spoilersArmed: false, spoilersDeployed: false, speedBrake: 0 },
    engines: [
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
    ],
    fuel: { totalFuel: spec.maxFuel, fuelFlowTotal: 0, centerTank: spec.fuelCapacity.center, leftTank: spec.fuelCapacity.left, rightTank: spec.fuelCapacity.right },
    electrical: { gen1Online: false, gen2Online: false, acBusPowered: false, batteryVolts: 28 },
    hydraulic: { systemAPsi: 0, systemBPsi: 0, standbyPsi: 0 },
    grossWeight: spec.emptyWeight + spec.maxFuel,
    cg: 25,
    simTime: 0,
    flightPhase: 'PARKED',
  };
}
