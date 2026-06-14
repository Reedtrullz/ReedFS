import type { ControlInputs } from '../../sim/types';
import { composeControlsSlice, syncGuidanceState } from '../../sim/simulationStep';
import { createAutopilotControllerState } from '../../sim/systems/autopilot';
import { createInputManagerState } from '../../input/InputManager';
import type { InputActions } from '../../input/InputManager';
import { resolveGearLeverCommand } from '../../input/gearCommand';
import { isPositiveRateEstablished } from '../../sim/flightPhasePredicates';
import { scenarioById } from '../../sim/scenarios';
import type { SimStore } from '../simStore';
import {
  inputActionsIncludeManualApAxis,
  isRejectedTakeoffAbortLatched,
  reduceInputManagerActions,
  sanitizeSetInputPartial,
  syncInputManagerWithInputPartial,
} from '../simStoreInputReducers';
import type { SimStoreSet } from './aircraftSlice';
import {
  apEffectivelyOwnsThrust,
  apIsEffectivelyEngaged,
  commandsForThrustOwnership,
  disconnectAutopilot,
} from './autoflightSlice';

function gateGearLeverPatch(
  partial: Partial<ControlInputs>,
  currentGearLever: ControlInputs['gearLever'],
  aircraft: SimStore['aircraft'],
): Partial<ControlInputs> {
  if (partial.gearLever === undefined) return partial;

  const gearCommand = resolveGearLeverCommand({
    current: currentGearLever,
    requested: partial.gearLever,
    positiveRate: isPositiveRateEstablished(aircraft),
  });
  if (gearCommand.gearLever === currentGearLever) {
    const rest = { ...partial };
    delete rest.gearLever;
    return rest;
  }

  return { ...partial, gearLever: gearCommand.gearLever };
}

export function createInputSlice(set: SimStoreSet): Pick<SimStore, 'setInput' | 'applyInputActions'> {
  return {
    setInput: (partial) =>
      set((s) => {
        const apActive = apIsEffectivelyEngaged(s);
        const apOwnsThrust = apEffectivelyOwnsThrust(s);
        const gatedPartial = gateGearLeverPatch(partial, s.pilotInputs.gearLever, s.aircraft);
        const { pilotPatch, shouldDisconnect } = sanitizeSetInputPartial(
          gatedPartial,
          s.pilotInputs,
          s.effectiveControls,
          apActive,
          apOwnsThrust,
        );
        const pilotInputs = { ...s.pilotInputs, ...pilotPatch };
        const apState = shouldDisconnect ? disconnectAutopilot(s.apState) : s.apState;
        const apControllerState = shouldDisconnect ? createAutopilotControllerState() : s.apControllerState;
        const apCommands = shouldDisconnect ? {} : commandsForThrustOwnership(s.apCommands, apOwnsThrust);
        const controlsSlice = composeControlsSlice(pilotInputs, apCommands, apState, s);
        const scenario = scenarioById(s.selectedScenarioId);
        return {
          ...controlsSlice,
          apState,
          apControllerState,
          inputManager: syncInputManagerWithInputPartial(s.inputManager, pilotPatch),
          guidance: syncGuidanceState(s.guidance, scenario, s.status, s.aircraft, controlsSlice.effectiveControls),
        };
      }),

    applyInputActions: (actions: InputActions, dt: number) =>
      set((s) => {
        let { inputManager, inputPatch } = reduceInputManagerActions({
          inputManager: s.inputManager,
          pilotInputs: s.pilotInputs,
          actions,
          dt,
        });
        const rejectedTakeoffAbort = isRejectedTakeoffAbortLatched(s.status, s.aircraft, s.pilotInputs);
        if (rejectedTakeoffAbort) {
          inputPatch = {
            ...inputPatch,
            throttle1: 0,
            throttle2: 0,
            brake: 1,
            spoilers: 1,
          };
        }

        const apOwnsThrust = apEffectivelyOwnsThrust(s);
        const apActive = apIsEffectivelyEngaged(s);
        if (!rejectedTakeoffAbort && apOwnsThrust && (inputPatch.throttle1 !== undefined || inputPatch.throttle2 !== undefined)) {
          inputPatch = { ...inputPatch };
          delete inputPatch.throttle1;
          delete inputPatch.throttle2;
          inputManager = createInputManagerState({
            ...inputManager,
            throttle: Math.max(s.pilotInputs.throttle1, s.pilotInputs.throttle2),
          });
        }
        inputPatch = gateGearLeverPatch(inputPatch, s.pilotInputs.gearLever, s.aircraft);

        const trimChanged = inputManager.stabilizerTrimUnits !== s.aircraft.config.stabilizerTrimUnits;
        const aircraft = trimChanged ? structuredClone(s.aircraft) : s.aircraft;
        if (trimChanged) {
          aircraft.config.stabilizerTrimUnits = inputManager.stabilizerTrimUnits;
        }

        const pilotInputs = Object.keys(inputPatch).length > 0 ? { ...s.pilotInputs, ...inputPatch } : s.pilotInputs;
        const shouldDisconnect = inputActionsIncludeManualApAxis(actions, apActive);
        const apState = shouldDisconnect ? disconnectAutopilot(s.apState) : s.apState;
        const apControllerState = shouldDisconnect ? createAutopilotControllerState() : s.apControllerState;
        const apCommands = shouldDisconnect ? {} : commandsForThrustOwnership(s.apCommands, apOwnsThrust);
        const controlsSlice = composeControlsSlice(pilotInputs, apCommands, apState, { ...s, aircraft });
        const scenario = scenarioById(s.selectedScenarioId);

        return {
          ...controlsSlice,
          inputManager,
          aircraft,
          apState,
          apControllerState,
          guidance: syncGuidanceState(s.guidance, scenario, s.status, aircraft, controlsSlice.effectiveControls),
        };
      }),
  };
}
