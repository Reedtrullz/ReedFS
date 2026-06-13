import { useCallback } from 'react';
import { useSimStore } from '../store/simStore';
import { createDefaultAutopilotStateFromAircraft } from '../instruments/defaultAutopilotState';
import {
  COCKPIT_INTERACTIONS,
  cockpitActionForInteraction,
  type CockpitInteractionActivationResult,
  type CockpitInteractionId,
} from './cockpitInteractions';

export interface CockpitInteractionHandlers {
  activateCockpitInteraction: (interactionId: CockpitInteractionId) => CockpitInteractionActivationResult;
}

function definitionForInteraction(interactionId: CockpitInteractionId) {
  return COCKPIT_INTERACTIONS.find((entry) => entry.id === interactionId) ?? COCKPIT_INTERACTIONS[0];
}

export function useCockpitInteractions(): CockpitInteractionHandlers {
  const setInput = useSimStore((s) => s.setInput);
  const setApState = useSimStore((s) => s.setApState);

  const activateCockpitInteraction = useCallback((interactionId: CockpitInteractionId): CockpitInteractionActivationResult => {
    const state = useSimStore.getState();
    const definition = definitionForInteraction(interactionId);
    const action = cockpitActionForInteraction(interactionId, state.inputs);

    if (action.kind === 'unavailable') {
      return {
        status: 'unavailable',
        interactionId,
        label: definition.label,
        reason: action.reason,
      };
    }

    if (action.kind === 'mcp-toggle-fd-left') {
      const next = structuredClone(state.apState ?? createDefaultAutopilotStateFromAircraft(state.aircraft, state.wind));
      next.boeing.fdLeft = !next.boeing.fdLeft;
      setApState(next);
      return {
        status: 'applied',
        interactionId,
        label: definition.label,
        action: 'mcp-toggle-fd-left',
      };
    }

    setInput(action.patch);
    return {
      status: 'applied',
      interactionId,
      label: definition.label,
      action: 'input-patch',
      patch: action.patch,
    };
  }, [setInput, setApState]);

  return { activateCockpitInteraction };
}
