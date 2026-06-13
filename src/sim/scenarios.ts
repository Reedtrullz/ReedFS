import type { AircraftSpec, AircraftState, FuelState, GeoPosition } from './types';
import { createB737GearStations, createInitialState } from './types';
import { eulerToQuat } from './physics/quaternion';
import type { WindInfo } from './weather';
import { ENVA_RUNWAY_09, KSEA_RUNWAY_16L } from '../viewport/runwayData';

export interface ScenarioFuelLoad {
  centerTank: number;
  leftTank: number;
  rightTank: number;
  totalFuel: number;
}

export interface RunwayScenario {
  airport: string;
  runway: string;
  elevationFt: number;
  headingDeg: number;
}

export interface ScenarioTutorialStep {
  id: string;
  title: string;
  body: string;
}

export interface FlightScenario {
  id: string;
  name: string;
  description: string;
  position: GeoPosition;
  runway: RunwayScenario;
  fuel: ScenarioFuelLoad;
  zeroFuelWeightKg: number;
  grossWeightKg: number;
  payloadWeightKg: number;
  cgPercent: number;
  stabilizerTrimUnits: number;
  flapSetting: number;
  wind: WindInfo;
  tutorialSteps: ScenarioTutorialStep[];
}

// ── ENVA (default) ─────────────────────────────────────────────────────
export const ENVA_TUTORIAL_SCENARIO: FlightScenario = {
  id: 'enva-tutorial',
  name: 'ENVA Tutorial Takeoff',
  description: 'Medium-weight 737-800 at Trondheim Værnes for a flaps-5 eastbound runway 09 takeoff.',
  position: { lat: ENVA_RUNWAY_09.start.lat, lon: ENVA_RUNWAY_09.start.lon, alt: ENVA_RUNWAY_09.elevationFt },
  runway: { airport: ENVA_RUNWAY_09.airport, runway: ENVA_RUNWAY_09.id, elevationFt: ENVA_RUNWAY_09.elevationFt, headingDeg: ENVA_RUNWAY_09.headingDeg },
  fuel: { centerTank: 8_000, leftTank: 2_000, rightTank: 2_000, totalFuel: 12_000 },
  zeroFuelWeightKg: 49_913,
  grossWeightKg: 61_913,
  payloadWeightKg: 8_500,
  cgPercent: 25,
  stabilizerTrimUnits: 5.0,
  flapSetting: 5,
  wind: { dir: 90, speed: 0 },
  tutorialSteps: [
    {
      id: 'line-up',
      title: 'Line up and configure',
      body: 'Start on ENVA runway 09 with gear down and both throttles idle. START ROLL resets the takeoff levers, so set flaps 5, trim 5.0, then advance thrust manually.',
    },
    {
      id: 'advance-thrust',
      title: 'Advance thrust smoothly',
      body: 'Bring both thrust levers to takeoff power, keep the centerline with small rudder inputs, and monitor IAS on the PFD.',
    },
    {
      id: 'rotate-positive-rate',
      title: 'Rotate and clean up',
      body: 'At VR, ease back to about 10° pitch. After positive rate, retract gear and climb out before cleaning flaps.',
    },
  ],
};

// ── KSEA ────────────────────────────────────────────────────────────────
export const KSEA_TUTORIAL_SCENARIO: FlightScenario = {
  id: 'ksea-tutorial',
  name: 'KSEA Tutorial Takeoff',
  description: 'Medium-weight 737-800 configured for a flaps-5 southbound KSEA takeoff.',
  position: { lat: KSEA_RUNWAY_16L.start.lat, lon: KSEA_RUNWAY_16L.start.lon, alt: KSEA_RUNWAY_16L.elevationFt },
  runway: { airport: KSEA_RUNWAY_16L.airport, runway: KSEA_RUNWAY_16L.id, elevationFt: KSEA_RUNWAY_16L.elevationFt, headingDeg: KSEA_RUNWAY_16L.headingDeg },
  fuel: { centerTank: 8_000, leftTank: 2_000, rightTank: 2_000, totalFuel: 12_000 },
  zeroFuelWeightKg: 49_913,
  grossWeightKg: 61_913,
  payloadWeightKg: 8_500,
  cgPercent: 25,
  stabilizerTrimUnits: 5.0,
  flapSetting: 5,
  wind: { dir: 180, speed: 0 },
  tutorialSteps: [
    {
      id: 'line-up',
      title: 'Line up and configure',
      body: 'Start on KSEA 16L with gear down and both throttles idle. START ROLL resets the takeoff levers, so set flaps 5, trim 5.0, then advance thrust manually.',
    },
    {
      id: 'advance-thrust',
      title: 'Advance thrust smoothly',
      body: 'Bring both thrust levers to takeoff power, keep the centerline with small rudder inputs, and monitor IAS on the PFD.',
    },
    {
      id: 'rotate-positive-rate',
      title: 'Rotate and clean up',
      body: 'At VR, ease back to about 10° pitch. After positive rate, retract gear and climb out before cleaning flaps.',
    },
  ],
};

export const KSEA_LIGHT_PATTERN_SCENARIO: FlightScenario = {
  id: 'ksea-light-pattern',
  name: 'KSEA Light Pattern Work',
  description: 'Lightweight flaps-5 setup for repeated hand-flying and pattern practice.',
  position: { lat: KSEA_RUNWAY_16L.start.lat, lon: KSEA_RUNWAY_16L.start.lon, alt: KSEA_RUNWAY_16L.elevationFt },
  runway: { airport: KSEA_RUNWAY_16L.airport, runway: KSEA_RUNWAY_16L.id, elevationFt: KSEA_RUNWAY_16L.elevationFt, headingDeg: KSEA_RUNWAY_16L.headingDeg },
  fuel: { centerTank: 4_000, leftTank: 1_000, rightTank: 1_000, totalFuel: 6_000 },
  zeroFuelWeightKg: 44_413,
  grossWeightKg: 50_413,
  payloadWeightKg: 3_000,
  cgPercent: 24,
  stabilizerTrimUnits: 4.5,
  flapSetting: 5,
  wind: { dir: 200, speed: 6 },
  tutorialSteps: [
    {
      id: 'pattern-setup',
      title: 'Pattern setup',
      body: 'Use the light pattern scenario for hand-flying practice: flaps 5, light fuel, and a small left-crosswind correction.',
    },
    {
      id: 'climb-crosswind',
      title: 'Climb and turn crosswind',
      body: 'Climb at a controlled pitch, keep wings level until safe altitude, then make a gentle pattern turn.',
    },
    {
      id: 'repeat-handfly',
      title: 'Repeat hand-flying corrections',
      body: 'Use small pitch/roll inputs and watch PFD trend cues instead of chasing the debug telemetry.',
    },
  ],
};

export const SCENARIOS: FlightScenario[] = [ENVA_TUTORIAL_SCENARIO, KSEA_TUTORIAL_SCENARIO, KSEA_LIGHT_PATTERN_SCENARIO];

const CENTER_TANK_ARM_PERCENT_MAC = 22;
const WING_TANK_ARM_PERCENT_MAC = 30;

function nearlyEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}

function validateScenario(spec: AircraftSpec, scenario: FlightScenario): void {
  const tankSum = scenario.fuel.centerTank + scenario.fuel.leftTank + scenario.fuel.rightTank;
  if (!nearlyEqual(tankSum, scenario.fuel.totalFuel)) {
    throw new Error(`${scenario.id} fuel total does not match tank sum`);
  }

  if (scenario.fuel.centerTank > spec.fuelCapacity.center || scenario.fuel.leftTank > spec.fuelCapacity.left || scenario.fuel.rightTank > spec.fuelCapacity.right) {
    throw new Error(`${scenario.id} fuel exceeds tank capacity`);
  }

  const expectedZeroFuelWeight = spec.emptyWeight + scenario.payloadWeightKg;
  if (!nearlyEqual(scenario.zeroFuelWeightKg, expectedZeroFuelWeight)) {
    throw new Error(`${scenario.id} zero fuel weight must equal empty weight plus payload`);
  }

  const expectedGrossWeight = scenario.zeroFuelWeightKg + scenario.fuel.totalFuel;
  if (!nearlyEqual(scenario.grossWeightKg, expectedGrossWeight)) {
    throw new Error(`${scenario.id} gross weight must equal zero fuel weight plus fuel`);
  }

  if (scenario.grossWeightKg > spec.maxTakeoffWeight) {
    throw new Error(`${scenario.id} gross weight exceeds MTOW`);
  }

  if (scenario.cgPercent < spec.cgLimits[0] || scenario.cgPercent > spec.cgLimits[1]) {
    throw new Error(`${scenario.id} CG is outside aircraft limits`);
  }

  if (!nearlyEqual(scenario.position.alt, scenario.runway.elevationFt)) {
    throw new Error(`${scenario.id} runway elevation must match scenario position altitude`);
  }
}

function zeroFuelCgForScenario(scenario: FlightScenario): number {
  const fuelMoment =
    scenario.fuel.centerTank * CENTER_TANK_ARM_PERCENT_MAC +
    (scenario.fuel.leftTank + scenario.fuel.rightTank) * WING_TANK_ARM_PERCENT_MAC;
  return (scenario.cgPercent * scenario.grossWeightKg - fuelMoment) / scenario.zeroFuelWeightKg;
}

export function scenarioById(id: string): FlightScenario {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) {
    throw new Error(`Unknown RFS scenario: ${id}`);
  }

  return scenario;
}

function fuelStateFromScenario(fuel: ScenarioFuelLoad): FuelState {
  return {
    centerTank: fuel.centerTank,
    leftTank: fuel.leftTank,
    rightTank: fuel.rightTank,
    totalFuel: fuel.totalFuel,
    fuelFlowTotal: 0,
  };
}

export function createAircraftStateForScenario(spec: AircraftSpec, scenario: FlightScenario): AircraftState {
  validateScenario(spec, scenario);
  const state = createInitialState(spec);
  const headingRad = scenario.runway.headingDeg * Math.PI / 180;
  const zeroFuelWeight = scenario.zeroFuelWeightKg;
  const grossWeight = scenario.grossWeightKg;

  state.position = { ...scenario.position, alt: scenario.runway.elevationFt };
  state.attitude = { phi: 0, theta: 0, psi: headingRad };
  state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
  state.velocity = { u: 0, v: 0, w: 0 };
  state.angularVel = { p: 0, q: 0, r: 0 };
  state.config = {
    flapSetting: scenario.flapSetting,
    gearDown: true,
    gearPosition: 1,
    spoilersArmed: false,
    spoilersDeployed: false,
    speedBrake: 0,
    stabilizerTrimUnits: scenario.stabilizerTrimUnits,
  };
  state.fuel = fuelStateFromScenario(scenario.fuel);
  state.payloadWeight = scenario.payloadWeightKg;
  state.zeroFuelWeight = zeroFuelWeight;
  state.zeroFuelCg = zeroFuelCgForScenario(scenario);
  state.grossWeight = grossWeight;
  state.cg = scenario.cgPercent;
  state.ground = {
    aglFt: 0,
    groundAltFt: scenario.runway.elevationFt,
    weightOnWheels: true,
    normalForceN: grossWeight * 9.80665,
    lastTouchdownSinkRateMps: 0,
    onRunway: true,
    contact: 'gear',
    tailstrike: false,
    gearStations: createB737GearStations(grossWeight * 9.80665, true),
  };
  state.flightPhase = 'PARKED';
  state.simTime = 0;

  return state;
}
