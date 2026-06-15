import type { AutoflightTruthState, AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { SimulationStatus } from './simulationStatus';
import type { WindInfo } from './weather';
import type { AircraftSpec, AircraftState, AutopilotCommands, ControlInputs, FlightPhase } from './types';
import { integrate } from './physics/integrate';
import { deriveRouteDrivenFlightPhase } from './flightPhasePredicates';
import { rebuildGuidanceState, type GuidanceState } from './guidanceState';
import { scenarioById, type FlightScenario } from './scenarios';
import {
  computeRouteStatus,
  createNoRouteStatus,
  type RouteStatusSnapshot,
} from './systems/navigation';
import {
  composeEffectiveControls,
  computeAutopilotCommandsForStateWithControllerState,
  createAutopilotControllerState,
  type AutopilotControllerState,
} from './systems/autopilot';
import {
  deriveEffectiveAutoflightTruth,
  type EffectiveAutoflightTruthContext,
} from './systems/effectiveAutoflightTruth';

const AP_LATERAL_SERVO_MODES = new Set<AutoflightTruthState['lateralActive']>(['HDG_SEL', 'LNAV']);
const AP_VERTICAL_SERVO_MODES = new Set<AutoflightTruthState['verticalActive']>([
  'ALT_HOLD',
  'VS',
  'VNAV',
  'VNAV_PTH',
  'ALT*',
]);
const AP_THRUST_SERVO_MODES = new Set<AutoflightTruthState['thrustActive']>(['SPEED', 'N1']);

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function altitudeTargetForConstraint(
  currentAltitudeFt: number,
  constraint: FlightPlan['waypoints'][number]['altitudeConstraint'],
): number | null {
  const altitude = finiteNumber(constraint?.altitude);
  if (altitude === null) return null;
  if (constraint?.type === 'AT') return currentAltitudeFt > altitude ? altitude : null;
  if (constraint?.type === 'AT_OR_BELOW') return currentAltitudeFt > altitude ? altitude : null;
  if (constraint?.type === 'AT_OR_ABOVE') return null;
  if (constraint?.type === 'BETWEEN') {
    const altitude2 = finiteNumber(constraint.altitude2);
    if (altitude2 === null) return null;
    const lower = Math.min(altitude, altitude2);
    const upper = Math.max(altitude, altitude2);
    if (currentAltitudeFt < lower) return null;
    if (currentAltitudeFt > upper) return upper;
    return null;
  }
  return null;
}

export function resolveRouteDescentTargetAltitudeFt(
  flightPlan: FlightPlan | null,
  routeStatus: RouteStatusSnapshot,
  currentAltitudeFt: number,
): number | null {
  if (!flightPlan?.waypoints.length || !routeStatus.routeValid || routeStatus.routeComplete) return null;
  const startIndex = finiteNumber(routeStatus.toWaypointIndex) ?? finiteNumber(routeStatus.activeLegIndex) ?? 0;
  for (let index = Math.max(0, Math.trunc(startIndex)); index < flightPlan.waypoints.length; index += 1) {
    const altitudeTarget = altitudeTargetForConstraint(currentAltitudeFt, flightPlan.waypoints[index]?.altitudeConstraint);
    if (altitudeTarget !== null) return altitudeTarget;
  }
  return null;
}

function setFlightPhase(state: AircraftState, phase: FlightPhase): void {
  if (state.flightPhase !== phase) {
    state.flightPhase = phase;
    state.flightPhaseStartedMs = state.simTime;
  }
}

function updateRouteDrivenFlightPhase(
  state: AircraftState,
  flightPlan: FlightPlan | null,
  routeStatus: RouteStatusSnapshot,
): void {
  const phase = deriveRouteDrivenFlightPhase(state, {
    routeStatus,
    descentTargetAltitudeFt: resolveRouteDescentTargetAltitudeFt(flightPlan, routeStatus, state.position.alt),
  });
  setFlightPhase(state, phase);
}

export interface ControlsSlice {
  pilotInputs: ControlInputs;
  apCommands: AutopilotCommands;
  effectiveControls: ControlInputs;
  inputs: ControlInputs;
}

export interface SimulationStepInput {
  aircraft: AircraftState;
  spec: AircraftSpec;
  pilotInputs: ControlInputs;
  apState: AutopilotState | null;
  flightPlan: FlightPlan | null;
  activeLegIndex: number | null;
  routeStatus: RouteStatusSnapshot;
  wind: WindInfo | null;
  dt: number;
  status: SimulationStatus;
  selectedScenarioId: string;
  guidance: GuidanceState;
  apControllerState?: AutopilotControllerState;
  /**
   * Default true keeps direct callers isolated. Store/runtime loops can clone once before
   * repeated fixed steps and set this false to avoid cloning the aircraft every substep.
   */
  cloneAircraft?: boolean;
}

export interface SimulationStepResult {
  aircraft: AircraftState;
  routeStatus: RouteStatusSnapshot;
  activeLegIndex: number | null;
  apCommands: AutopilotCommands;
  controls: ControlsSlice;
  guidance: GuidanceState;
  apControllerState: AutopilotControllerState;
}

function filterApCommandsByEffectiveModes(
  apCommands: AutopilotCommands,
  truth: AutoflightTruthState,
): AutopilotCommands {
  const autopilotEngaged = truth.autopilotStatus !== 'OFF';
  const filtered: AutopilotCommands = {};
  if (autopilotEngaged && AP_LATERAL_SERVO_MODES.has(truth.lateralActive) && apCommands.aileron !== undefined) {
    filtered.aileron = apCommands.aileron;
  }
  if (autopilotEngaged && AP_VERTICAL_SERVO_MODES.has(truth.verticalActive) && apCommands.elevator !== undefined) {
    filtered.elevator = apCommands.elevator;
  }
  if (AP_THRUST_SERVO_MODES.has(truth.thrustActive)) {
    if (apCommands.throttle1 !== undefined) filtered.throttle1 = apCommands.throttle1;
    if (apCommands.throttle2 !== undefined) filtered.throttle2 = apCommands.throttle2;
  }
  return filtered;
}

export function composeControlsSlice(
  pilotInputs: ControlInputs,
  apCommands: AutopilotCommands = {},
  apState: AutopilotState | null = null,
  truthContext: EffectiveAutoflightTruthContext = {},
): ControlsSlice {
  const effectiveTruth = deriveEffectiveAutoflightTruth(apState, truthContext);
  const activeApCommands = filterApCommandsByEffectiveModes(apCommands, effectiveTruth);
  const autoflightOwnsAnyAxis = effectiveTruth.autopilotStatus !== 'OFF' || Object.keys(activeApCommands).length > 0;
  const effectiveControls = composeEffectiveControls(pilotInputs, activeApCommands, autoflightOwnsAnyAxis);
  return {
    pilotInputs,
    apCommands: activeApCommands,
    effectiveControls,
    inputs: effectiveControls,
  };
}

export function syncGuidanceState(
  currentGuidance: GuidanceState,
  scenario: FlightScenario,
  status: SimulationStatus,
  aircraft: AircraftState,
  controls: ControlInputs,
  tutorialStepIndex?: number,
): GuidanceState {
  return rebuildGuidanceState(currentGuidance, { scenario, status, aircraft, controls, tutorialStepIndex });
}

export function advanceSimulationStep(input: SimulationStepInput): SimulationStepResult {
  const state = input.cloneAircraft === false ? input.aircraft : structuredClone(input.aircraft);
  const scenario = scenarioById(input.selectedScenarioId);
  const routeBeforeTick = input.flightPlan
    ? computeRouteStatus(state, input.flightPlan, input.activeLegIndex)
    : createNoRouteStatus();
  const truthContext: EffectiveAutoflightTruthContext = {
    aircraft: state,
    flightPlan: input.flightPlan,
    routeStatus: routeBeforeTick,
  };
  const effectiveTruth = deriveEffectiveAutoflightTruth(input.apState, truthContext);
  const autoflightCommandsActive = effectiveTruth.autopilotStatus !== 'OFF'
    || AP_THRUST_SERVO_MODES.has(effectiveTruth.thrustActive);
  const controllerStateBeforeStep = input.apControllerState ?? createAutopilotControllerState();
  const apCommandResult = autoflightCommandsActive
    ? computeAutopilotCommandsForStateWithControllerState(
      state,
      input.apState,
      input.flightPlan,
      input.dt,
      routeBeforeTick.activeLegIndex,
      routeBeforeTick,
      input.wind,
      controllerStateBeforeStep,
    )
    : { commands: {}, controllerState: controllerStateBeforeStep };
  const apCommands = apCommandResult.commands;
  const controlsForIntegration = composeControlsSlice(input.pilotInputs, apCommands, input.apState, truthContext);

  integrate(state, controlsForIntegration.effectiveControls, input.spec, input.dt, input.wind, scenario.weather);

  const routeStatus = input.flightPlan
    ? computeRouteStatus(state, input.flightPlan, routeBeforeTick.activeLegIndex)
    : createNoRouteStatus();
  updateRouteDrivenFlightPhase(state, input.flightPlan, routeStatus);
  const committedTruthContext: EffectiveAutoflightTruthContext = {
    aircraft: state,
    flightPlan: input.flightPlan,
    routeStatus,
  };
  const controls = composeControlsSlice(input.pilotInputs, apCommands, input.apState, committedTruthContext);

  return {
    aircraft: state,
    routeStatus,
    activeLegIndex: routeStatus.activeLegIndex,
    apCommands: controls.apCommands,
    controls,
    guidance: syncGuidanceState(input.guidance, scenario, input.status, state, controls.effectiveControls),
    apControllerState: apCommandResult.controllerState,
  };
}
