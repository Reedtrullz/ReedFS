import { useCallback } from 'react';
import { useSimStore } from '../store/simStore';
import {
  cockpitInputForInteraction,
  type CockpitInteractionId,
} from './cockpitInteractions';

export interface CockpitInteractionHandlers {
  activateCockpitInteraction: (interactionId: CockpitInteractionId) => boolean;
}

export function useCockpitInteractions(): CockpitInteractionHandlers {
  const setInput = useSimStore((s) => s.setInput);

  const activateCockpitInteraction = useCallback((interactionId: CockpitInteractionId): boolean => {
    const currentInputs = useSimStore.getState().inputs;
    const patch = cockpitInputForInteraction(interactionId, currentInputs);
    if (!patch) return false;
    setInput(patch);
    return true;
  }, [setInput]);

  return { activateCockpitInteraction };
}
