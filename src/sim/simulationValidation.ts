import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { SimulationStepInput, SimulationStepResult } from './simulationStep';
import { B737_800_SPEC, createInitialState, type AircraftState, type ControlInputs, type AutopilotCommands } from './types';
import type { ScenarioWeatherMetadata, WindInfo } from './weather';
import type { AutopilotControllerState } from './systems/autopilot';
import { SCENARIOS } from './scenarios';

type RecordValue = Record<string, unknown>;
export const MAX_SIMULATION_BATCH_STEPS = 4096;
export const MAX_SIMULATION_STEP_SECONDS = 0.1;

export function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Check once per boundary, with bounded traversal; never inside each substep.
export function isFiniteSimulationData(value: unknown): boolean {
  let remaining = 50_000;
  const active = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (--remaining < 0 || depth > 24) return false;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') return item.length <= 32_768;
    if (item == null || typeof item === 'boolean') return true;
    if (typeof item !== 'object' || active.has(item)) return false;
    const values = Array.isArray(item) ? item : Object.values(item);
    if (values.length > 4096) return false;
    active.add(item);
    const valid = values.every((child) => visit(child, depth + 1));
    active.delete(item);
    return valid;
  }
  return visit(value, 0);
}

function fields(value: unknown, numbers = '', booleans = '', strings = ''): value is RecordValue {
  if (!isRecord(value)) return false;
  return numbers.split(' ').filter(Boolean).every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
    && booleans.split(' ').filter(Boolean).every((key) => typeof value[key] === 'boolean')
    && strings.split(' ').filter(Boolean).every((key) => typeof value[key] === 'string');
}
function range(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function index(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}
function optionalNumbers(value: RecordValue, names: string): boolean {
  return names.split(' ').every((key) => value[key] == null || typeof value[key] === 'number');
}
function nullableNumbers(value: RecordValue, names: string): boolean {
  return names.split(' ').every((key) => key in value && (value[key] === null || typeof value[key] === 'number'));
}

export function isControlInputs(value: unknown): value is ControlInputs {
  if (!fields(value, 'elevator aileron rudder throttle1 throttle2 flapLever spoilers brake', '', 'gearLever')) return false;
  return ['elevator', 'aileron', 'rudder'].every((key) => range(value[key], -1, 1))
    && ['throttle1', 'throttle2', 'spoilers', 'brake'].every((key) => range(value[key], 0, 1))
    && ['leftBrake', 'rightBrake'].every((key) => value[key] === undefined || range(value[key], 0, 1))
    && range(value.flapLever, 0, 40) && ['UP', 'DOWN'].includes(String(value.gearLever));
}
export function isAutopilotCommands(value: unknown): value is AutopilotCommands {
  return isRecord(value) && Object.entries(value).every(([key, number]) =>
    ['elevator', 'aileron'].includes(key) ? range(number, -1, 1)
      : ['throttle1', 'throttle2'].includes(key) && range(number, 0, 1));
}
const aircraftShape = createInitialState(B737_800_SPEC);
delete aircraftShape.flightPhaseStartedMs;
function matchesShape(value: unknown, template: unknown): boolean {
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (template === null) return value === null;
  if (Array.isArray(template)) return Array.isArray(value) && value.length === template.length
    && value.every((item, i) => matchesShape(item, template[i]));
  if (isRecord(template)) return isRecord(value) && Object.entries(template).every(([key, child]) => matchesShape(value[key], child));
  return typeof value === typeof template;
}
export function isAircraftState(value: unknown): value is AircraftState {
  if (!isRecord(value) || !isFiniteSimulationData(value) || !matchesShape(value, aircraftShape)) return false;
  const aircraft = value as unknown as AircraftState;
  if (aircraft.flightPhaseStartedMs !== undefined && typeof aircraft.flightPhaseStartedMs !== 'number') return false;
  const norm = Math.hypot(aircraft.quaternion.q0, aircraft.quaternion.q1, aircraft.quaternion.q2, aircraft.quaternion.q3);
  return Math.abs(norm - 1) <= 0.02 && range(aircraft.position.lat, -90, 90) && range(aircraft.position.lon, -180, 180)
    && range(aircraft.config.flapSetting, 0, 40) && range(aircraft.config.gearPosition, 0, 1)
    && range(aircraft.config.speedBrake, 0, 1) && range(aircraft.config.stabilizerTrimUnits, 0, 15)
    && aircraft.grossWeight > 0 && aircraft.zeroFuelWeight > 0 && aircraft.payloadWeight >= 0 && aircraft.simTime >= 0
    && Object.values(aircraft.fuel).every((number) => number >= 0)
    && range(aircraft.timeOfDay, 0, 24) && ['none', 'gear', 'belly', 'crashed'].includes(aircraft.ground.contact)
    && ['PARKED', 'TAXI', 'TAKEOFF', 'CLIMB', 'CRUISE', 'DESCENT', 'APPROACH', 'TOUCHDOWN', 'DEROTATION', 'ROLLOUT', 'STOPPED', 'LANDED'].includes(aircraft.flightPhase);
}
export function isWeather(value: unknown): value is ScenarioWeatherMetadata {
  return fields(value, 'surfaceTemperatureC qnhHpa visibilityM cloudSeed', '', 'stationIcao')
    && range(value.qnhHpa, 100, 1200) && range(value.surfaceTemperatureC, -100, 100) && range(value.visibilityM, 0, 1e7)
    && fields(value.cloudAnchor, 'lat lon') && range(value.cloudAnchor.lat, -90, 90) && range(value.cloudAnchor.lon, -180, 180)
    && Array.isArray(value.clouds) && value.clouds.length <= 32 && value.clouds.every((cloud) => fields(cloud, 'base', '', 'cover'))
    && isFiniteSimulationData(value);
}
export function isWind(value: unknown): value is WindInfo | null {
  return value === null || (fields(value, 'dir speed') && range(value.dir, 0, 360) && range(value.speed, 0, 500)
    && optionalNumbers(value, 'gustSpeed gustSeed') && isFiniteSimulationData(value));
}
export function isFlightPlan(value: unknown): value is FlightPlan | null {
  return value === null || (fields(value, '', '', 'origin destination flightNumber route') && Array.isArray(value.waypoints)
    && value.waypoints.length <= 2048 && value.waypoints.every((waypoint) => fields(waypoint, '', 'discontinuity', 'ident')
      && optionalNumbers(waypoint, 'lat lon') && (waypoint.lat == null || range(waypoint.lat, -90, 90))
      && (waypoint.lon == null || range(waypoint.lon, -180, 180))) && isFiniteSimulationData(value));
}
export function isAutopilotState(value: unknown): value is AutopilotState | null {
  return value === null || (isRecord(value)
    && fields(value.boeing, 'courseL courseR heading altitude', 'fdLeft fdRight autothrottleArm n1 speedMode lnav vnav lvlChg hdgSel vorLoc app altHold vs cmdA cmdB cwsA cwsB')
    && nullableNumbers(value.boeing, 'speed mach verticalSpeed')
    && fields(value.airbus, 'altitude', 'speedManaged headingManaged altitudeManaged fd1 fd2 athr ap1 ap2 loc appr exped metricAltitude', 'hdgTrkMode speedMachMode')
    && nullableNumbers(value.airbus, 'speed heading verticalSpeed fpa')
    && ['HDG_VS', 'TRK_FPA'].includes(String(value.airbus.hdgTrkMode))
    && ['SPD', 'MACH'].includes(String(value.airbus.speedMachMode))
    && fields(value.truth, '', '', 'lateralActive verticalActive thrustActive autopilotStatus')
    && ['HDG_SEL', 'LNAV', 'VOR_LOC', 'LOC', 'APP', 'NAV', 'ROLL', 'HDG', 'OFF'].includes(String(value.truth.lateralActive))
    && ['ALT_HOLD', 'VNAV_PTH', 'LVL_CHG', 'VS', 'G_S', 'CLB', 'DES', 'OP_CLB', 'OP_DES', 'VNAV', 'OFF', 'ALT*'].includes(String(value.truth.verticalActive))
    && ['N1', 'SPEED', 'THR_CLB', 'IDLE', 'MAN_TOGA', 'MAN_FLEX', 'RETARD', 'OFF'].includes(String(value.truth.thrustActive))
    && ['OFF', 'CMD_A', 'CMD_B', 'CMD_AB', 'CWS_A', 'CWS_B', 'AP1', 'AP2', 'AP1_AP2'].includes(String(value.truth.autopilotStatus))
    && fields(value.truth.lastModeChangeTimestamps, 'thrust lateral vertical') && isFiniteSimulationData(value));
}
export function isAutopilotControllerState(value: unknown): value is AutopilotControllerState {
  return fields(value, 'throttleLimited') && ['pitchPid', 'rollPid', 'thrustPid', 'pitchTargetIntegral'].every((key) => fields(value[key], 'value prevError'));
}
function isRouteStatus(value: unknown): boolean {
  return fields(value, 'activeLegCount', 'routeValid positionIncompatible routeComplete lnavAvailable waypointReached sequenced', 'routeName approachHandoff')
    && ['none', 'final', 'threshold', 'complete'].includes(String(value.approachHandoff))
    && ['activeLegIndex', 'fromWaypointIndex', 'toWaypointIndex'].every((key) => index(value[key]))
    && ['fromIdent', 'nextWaypointIdent', 'lnavUnavailableReason'].every((key) => value[key] === null || typeof value[key] === 'string')
    && nullableNumbers(value, 'distanceToNextM distanceToNextNm desiredTrackRad desiredTrackDegTrue crossTrackErrorM alongTrackM legLengthM nextDesiredTrackRad nextDesiredTrackDegTrue turnAngleRad turnAnticipationDistanceM turnAnticipationDistanceNm etaMinutes');
}
function isTutorialStep(value: unknown): boolean { return fields(value, '', '', 'id title body'); }
function isGuidance(value: unknown): value is RecordValue {
  return fields(value, '', '', 'scenarioId phase coachMessage') && fields(value.tutorial, 'stepIndex', '', 'scenarioId')
    && value.tutorial.scenarioId === value.scenarioId && index(value.tutorial.stepIndex)
    && Array.isArray(value.tutorial.steps) && value.tutorial.steps.every(isTutorialStep)
    && (value.activeTutorialStep === null || isTutorialStep(value.activeTutorialStep))
    && Array.isArray(value.checklist) && value.checklist.every((item) => fields(item, '', 'complete', 'id label detail'))
    && Array.isArray(value.alerts) && value.alerts.every((item) => fields(item, '', '', 'id level message') && ['info', 'caution', 'warning'].includes(String(item.level)));
}
export function assertSimulationExecutionBounds(dt: number, steps: number): void {
  if (!Number.isFinite(dt) || dt <= 0 || dt > MAX_SIMULATION_STEP_SECONDS) throw new TypeError('Simulation timestep must be finite and within (0, 0.1] seconds');
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > MAX_SIMULATION_BATCH_STEPS) throw new TypeError('Simulation batch steps must be an integer within [1, 4096]');
}
export function assertSimulationStepInput(value: unknown): asserts value is SimulationStepInput {
  if (!isRecord(value) || !isFiniteSimulationData(value) || !isAircraftState(value.aircraft)
    || !fields(value.spec, 'emptyWeight maxFuel maxTakeoffWeight wingArea wingSpan meanChord aerodynamicCenterPercentMac maxThrust engineCount vStall maxFlaps ixx iyy izz ixz')
    || !fields(value.spec.fuelCapacity, 'center left right') || !Array.isArray(value.spec.cgLimits) || value.spec.cgLimits.length !== 2 || !value.spec.cgLimits.every((limit) => typeof limit === 'number')
    || !['emptyWeight', 'wingArea', 'wingSpan', 'meanChord', 'ixx', 'iyy', 'izz'].every((key) => Number(value.spec && (value.spec as RecordValue)[key]) > 0)
    || value.spec.engineCount !== 2 || !isControlInputs(value.pilotInputs) || !isAutopilotState(value.apState)
    || !isFlightPlan(value.flightPlan) || !index(value.activeLegIndex) || !isRouteStatus(value.routeStatus) || !isWind(value.wind)
    || (value.weather != null && !isWeather(value.weather)) || !['running', 'paused', 'stopped'].includes(String(value.status))
    || !SCENARIOS.some((scenario) => scenario.id === value.selectedScenarioId) || !isGuidance(value.guidance)
    || value.guidance.scenarioId !== value.selectedScenarioId || (value.apControllerState !== undefined && !isAutopilotControllerState(value.apControllerState))
    || (value.cloneAircraft !== undefined && typeof value.cloneAircraft !== 'boolean')) throw new TypeError('Invalid simulation step input');
  assertSimulationExecutionBounds(value.dt as number, (value.steps ?? 1) as number);
}
export function assertSimulationStepResult(value: unknown): asserts value is SimulationStepResult {
  if (!isRecord(value) || !isFiniteSimulationData(value) || !isAircraftState(value.aircraft) || !isRouteStatus(value.routeStatus)
    || !index(value.activeLegIndex) || value.activeLegIndex !== (value.routeStatus as RecordValue).activeLegIndex
    || !isAutopilotCommands(value.apCommands) || !isRecord(value.controls)
    || !['pilotInputs', 'effectiveControls', 'inputs'].every((key) => isControlInputs((value.controls as RecordValue)[key]))
    || !isAutopilotCommands(value.controls.apCommands) || !isGuidance(value.guidance) || !isAutopilotControllerState(value.apControllerState)) {
    throw new TypeError('Invalid simulation step result');
  }
}
