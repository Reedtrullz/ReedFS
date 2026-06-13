import type * as THREE from 'three';
import type { ControlInputs } from '../sim/types';
import { nextB737FlapDetent } from '../input/flapDetents';

export type CockpitInteractionId =
  | 'yoke'
  | 'throttle-levers'
  | 'flap-lever'
  | 'gear-lever'
  | 'speedbrake-lever'
  | 'mcp-panel';

export type CockpitInteractionAvailability = 'available' | 'unavailable';

export interface CockpitInteractionDefinition {
  id: CockpitInteractionId;
  objectName: string;
  label: string;
  hint: string;
  availability: CockpitInteractionAvailability;
  unavailableReason?: string;
}

export interface CockpitInteractionMetadata extends CockpitInteractionDefinition {
  interactive: true;
}

export const COCKPIT_INTERACTIONS: readonly CockpitInteractionDefinition[] = [
  {
    id: 'yoke',
    objectName: 'yoke',
    label: 'Yoke',
    hint: 'Unavailable: yoke drag is not implemented yet; use keyboard or gamepad pitch/roll controls.',
    availability: 'unavailable',
    unavailableReason: 'Yoke drag is not implemented yet; use keyboard or gamepad pitch/roll controls.',
  },
  {
    id: 'throttle-levers',
    objectName: 'throttleLever1',
    label: 'Throttle levers',
    hint: 'Click to advance both thrust levers by one detent.',
    availability: 'available',
  },
  {
    id: 'throttle-levers',
    objectName: 'throttleLever2',
    label: 'Throttle levers',
    hint: 'Click to advance both thrust levers by one detent.',
    availability: 'available',
  },
  {
    id: 'flap-lever',
    objectName: 'flapLever',
    label: 'Flap lever',
    hint: 'Click to cycle flap detents.',
    availability: 'available',
  },
  {
    id: 'gear-lever',
    objectName: 'gearLever',
    label: 'Gear lever',
    hint: 'Click to toggle commanded gear position.',
    availability: 'available',
  },
  {
    id: 'speedbrake-lever',
    objectName: 'speedbrakeLever',
    label: 'Speedbrake lever',
    hint: 'Click to toggle speedbrakes.',
    availability: 'available',
  },
  {
    id: 'mcp-panel',
    objectName: 'mcpPanel',
    label: 'Mode control panel',
    hint: 'Click to toggle the left flight director switch.',
    availability: 'available',
  },
] as const;

export type CockpitInteractionAction =
  | { kind: 'input'; patch: Partial<ControlInputs> }
  | { kind: 'mcp-toggle-fd-left' }
  | { kind: 'unavailable'; reason: string };

export type CockpitInteractionActivationResult =
  | {
    status: 'applied';
    interactionId: CockpitInteractionId;
    label: string;
    action: 'input-patch' | 'mcp-toggle-fd-left';
    patch?: Partial<ControlInputs>;
  }
  | {
    status: 'unavailable';
    interactionId: CockpitInteractionId;
    label: string;
    reason: string;
  };

export function interactionForObjectName(objectName: string): CockpitInteractionDefinition | undefined {
  return COCKPIT_INTERACTIONS.find((entry) => entry.objectName === objectName);
}

function roundedClamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

export function cockpitActionForInteraction(
  interactionId: CockpitInteractionId,
  current: ControlInputs,
): CockpitInteractionAction {
  const definition = COCKPIT_INTERACTIONS.find((entry) => entry.id === interactionId);
  if (definition?.availability === 'unavailable') {
    return {
      kind: 'unavailable',
      reason: definition.unavailableReason ?? `${definition.label} is not implemented yet.`,
    };
  }

  switch (interactionId) {
    case 'throttle-levers': {
      const nextThrottle = roundedClamp(Math.max(current.throttle1, current.throttle2) + 0.1, 0, 1);
      return { kind: 'input', patch: { throttle1: nextThrottle, throttle2: nextThrottle } };
    }
    case 'flap-lever':
      return { kind: 'input', patch: { flapLever: nextB737FlapDetent(current.flapLever) } };
    case 'gear-lever':
      return { kind: 'input', patch: { gearLever: current.gearLever === 'DOWN' ? 'UP' : 'DOWN' } };
    case 'speedbrake-lever':
      return { kind: 'input', patch: { spoilers: current.spoilers > 0.05 ? 0 : 1 } };
    case 'mcp-panel':
      return { kind: 'mcp-toggle-fd-left' };
    case 'yoke':
      return {
        kind: 'unavailable',
        reason: definition?.unavailableReason ?? 'This cockpit control is not implemented yet.',
      };
  }
}

export function cockpitInputForInteraction(
  interactionId: CockpitInteractionId,
  current: ControlInputs,
): Partial<ControlInputs> | null {
  const action = cockpitActionForInteraction(interactionId, current);
  return action.kind === 'input' ? action.patch : null;
}

export function attachCockpitInteractionMetadata(root: THREE.Object3D): void {
  if (typeof root.getObjectByName !== 'function') return;

  COCKPIT_INTERACTIONS.forEach((definition) => {
    const target = root.getObjectByName(definition.objectName);
    if (!target) return;
    target.userData.cockpitInteraction = {
      ...definition,
      interactive: true,
    } satisfies CockpitInteractionMetadata;
  });
}
