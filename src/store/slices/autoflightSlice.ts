import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { AutopilotCommands } from '../../sim/types';
import { composeControlsSlice, syncGuidanceState } from '../../sim/simulationStep';
import { createAutopilotControllerState } from '../../sim/systems/autopilot';
import {
  deriveEffectiveAutoflightTruth,
  effectiveAutopilotIsEngaged,
} from '../../sim/systems/effectiveAutoflightTruth';
import { scenarioById } from '../../sim/scenarios';
import type { SimStore } from '../simStore';
import type { SimStoreSet } from './aircraftSlice';

export function autopilotModesChanged(previous: AutopilotState | null, next: AutopilotState | null): boolean {
  if (!previous || !next) return previous !== next;
  return (
    previous.truth.autopilotStatus !== next.truth.autopilotStatus ||
    previous.truth.lateralActive !== next.truth.lateralActive ||
    previous.truth.verticalActive !== next.truth.verticalActive ||
    previous.truth.thrustActive !== next.truth.thrustActive
  );
}

type EffectiveTruthContext = Pick<SimStore, 'aircraft' | 'flightPlan' | 'routeStatus'>;

export function effectiveTruthOwnsThrust(apState: AutopilotState | null, context: EffectiveTruthContext): boolean {
  const truth = deriveEffectiveAutoflightTruth(apState, context);
  return truth.thrustActive === 'SPEED' || truth.thrustActive === 'N1';
}

export function apEffectivelyOwnsThrust(s: Pick<SimStore, 'apState' | 'aircraft' | 'flightPlan' | 'routeStatus'>): boolean {
  return effectiveTruthOwnsThrust(s.apState, s);
}

export function apIsEffectivelyEngaged(s: Pick<SimStore, 'apState' | 'aircraft' | 'flightPlan' | 'routeStatus'>): boolean {
  return effectiveAutopilotIsEngaged(s.apState, s);
}

function withoutThrottleApCommands(apCommands: AutopilotCommands): AutopilotCommands {
  if (apCommands.throttle1 === undefined && apCommands.throttle2 === undefined) return apCommands;
  const commands = { ...apCommands };
  delete commands.throttle1;
  delete commands.throttle2;
  return commands;
}

export function commandsForThrustOwnership(apCommands: AutopilotCommands, ownsThrust: boolean): AutopilotCommands {
  return ownsThrust ? apCommands : withoutThrottleApCommands(apCommands);
}

export function disconnectAutopilot(apState: AutopilotState | null): AutopilotState | null {
  if (!apState) return null;
  const next = structuredClone(apState);
  next.truth = {
    ...next.truth,
    autopilotStatus: 'OFF',
    lateralActive: 'OFF',
    verticalActive: 'OFF',
    thrustActive: 'OFF',
  };
  next.boeing = {
    ...next.boeing,
    cmdA: false,
    cmdB: false,
    cwsA: false,
    cwsB: false,
    n1: false,
    speedMode: false,
    lnav: false,
    vnav: false,
    hdgSel: false,
    vorLoc: false,
    app: false,
    altHold: false,
    vs: false,
  };
  next.airbus = {
    ...next.airbus,
    ap1: false,
    ap2: false,
    athr: false,
    loc: false,
    appr: false,
  };
  return next;
}

export function createAutoflightSlice(set: SimStoreSet): Pick<SimStore, 'setApState'> {
  return {
    setApState: (ap) => set((s) => {
      const modesChanged = autopilotModesChanged(s.apState, ap);
      const apControllerState = modesChanged ? createAutopilotControllerState() : s.apControllerState;
      const nextOwnsThrust = effectiveTruthOwnsThrust(ap, s);
      const apCommands = modesChanged ? {} : commandsForThrustOwnership(s.apCommands, nextOwnsThrust);
      const controlsSlice = composeControlsSlice(s.pilotInputs, apCommands, ap, s);
      const scenario = scenarioById(s.selectedScenarioId);
      return {
        apState: ap,
        apControllerState,
        ...controlsSlice,
        guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, controlsSlice.effectiveControls),
      };
    }),
  };
}
