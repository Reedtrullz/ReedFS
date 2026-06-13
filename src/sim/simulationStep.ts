import type { AutoflightTruthState, AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { SimulationStatus } from './simulationStatus';
import type { WindInfo } from './weather';
import type { AircraftSpec, AircraftState, AutopilotCommands, ControlInputs } from './types';
import { integrate } from './physics/integrate';
import { rebuildGuidanceState, type GuidanceState } from './guidanceState';
import { scenarioById, type FlightScenario } from './scenarios';
import {
  computeRouteStatus,
  createNoRouteStatus,
  type RouteStatusSnapshot,
} from './systems/navigation';
import {
  composeEffectiveControls,
  computeAutopilotCommandsForState,
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
  const apCommands = autoflightCommandsActive
    ? computeAutopilotCommandsForState(
      state,
      input.apState,
      input.flightPlan,
      input.dt,
      routeBeforeTick.activeLegIndex,
      routeBeforeTick,
      input.wind,
    )
    : {};
  const controlsForIntegration = composeControlsSlice(input.pilotInputs, apCommands, input.apState, truthContext);

  integrate(state, controlsForIntegration.effectiveControls, input.spec, input.dt, input.wind, scenario.weather);

  const routeStatus = input.flightPlan
    ? computeRouteStatus(state, input.flightPlan, routeBeforeTick.activeLegIndex)
    : createNoRouteStatus();
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
  };
}
