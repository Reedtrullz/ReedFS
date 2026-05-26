import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
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
  isAutopilotEngaged,
} from './systems/autopilot';

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
}

export interface SimulationStepResult {
  aircraft: AircraftState;
  routeStatus: RouteStatusSnapshot;
  activeLegIndex: number | null;
  apCommands: AutopilotCommands;
  controls: ControlsSlice;
  guidance: GuidanceState;
}

export function composeControlsSlice(
  pilotInputs: ControlInputs,
  apCommands: AutopilotCommands = {},
  apState: AutopilotState | null = null,
): ControlsSlice {
  const active = isAutopilotEngaged(apState);
  const activeApCommands = active ? apCommands : {};
  const effectiveControls = composeEffectiveControls(pilotInputs, activeApCommands, active);
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
  const state = structuredClone(input.aircraft);
  const routeBeforeTick = input.flightPlan
    ? computeRouteStatus(state, input.flightPlan, input.activeLegIndex)
    : createNoRouteStatus();
  const apActive = isAutopilotEngaged(input.apState);
  const apCommands = apActive
    ? computeAutopilotCommandsForState(
      state,
      input.apState,
      input.flightPlan,
      input.dt,
      routeBeforeTick.activeLegIndex,
    )
    : {};
  const controls = composeControlsSlice(input.pilotInputs, apCommands, input.apState);

  integrate(state, controls.effectiveControls, input.spec, input.dt, null, input.flightPlan, input.wind);

  const routeStatus = input.flightPlan
    ? computeRouteStatus(state, input.flightPlan, routeBeforeTick.activeLegIndex)
    : createNoRouteStatus();
  const scenario = scenarioById(input.selectedScenarioId);

  return {
    aircraft: state,
    routeStatus,
    activeLegIndex: routeStatus.activeLegIndex,
    apCommands: controls.apCommands,
    controls,
    guidance: syncGuidanceState(input.guidance, scenario, input.status, state, controls.effectiveControls),
  };
}
