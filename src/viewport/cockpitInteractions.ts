import type * as THREE from 'three';
import type { ControlInputs } from '../sim/types';

export type CockpitInteractionId =
  | 'yoke'
  | 'throttle-levers'
  | 'flap-lever'
  | 'gear-lever'
  | 'speedbrake-lever'
  | 'mcp-panel';

export interface CockpitInteractionDefinition {
  id: CockpitInteractionId;
  objectName: string;
  label: string;
  hint: string;
}

export interface CockpitInteractionMetadata extends CockpitInteractionDefinition {
  interactive: true;
}

const FLAP_DETENTS = [0, 1, 2, 5, 10, 15, 25, 30, 40] as const;

export const COCKPIT_INTERACTIONS: readonly CockpitInteractionDefinition[] = [
  {
    id: 'yoke',
    objectName: 'yoke',
    label: 'Yoke',
    hint: 'Drag axis placeholder for pitch/roll control.',
  },
  {
    id: 'throttle-levers',
    objectName: 'throttleLever1',
    label: 'Throttle levers',
    hint: 'Click to advance both thrust levers by one detent.',
  },
  {
    id: 'throttle-levers',
    objectName: 'throttleLever2',
    label: 'Throttle levers',
    hint: 'Click to advance both thrust levers by one detent.',
  },
  {
    id: 'flap-lever',
    objectName: 'flapLever',
    label: 'Flap lever',
    hint: 'Click to cycle flap detents.',
  },
  {
    id: 'gear-lever',
    objectName: 'gearLever',
    label: 'Gear lever',
    hint: 'Click to toggle commanded gear position.',
  },
  {
    id: 'speedbrake-lever',
    objectName: 'speedbrakeLever',
    label: 'Speedbrake lever',
    hint: 'Click to toggle speedbrakes.',
  },
  {
    id: 'mcp-panel',
    objectName: 'mcpPanel',
    label: 'Mode control panel',
    hint: 'Click target placeholder for future MCP rotary/button picking.',
  },
] as const;

export function interactionForObjectName(objectName: string): CockpitInteractionDefinition | undefined {
  return COCKPIT_INTERACTIONS.find((entry) => entry.objectName === objectName);
}

function nextFlapDetent(current: number): number {
  const currentIndex = FLAP_DETENTS.findIndex((detent) => current <= detent);
  if (currentIndex < 0 || currentIndex === FLAP_DETENTS.length - 1) return FLAP_DETENTS[0];
  if (FLAP_DETENTS[currentIndex] === current) return FLAP_DETENTS[currentIndex + 1];
  return FLAP_DETENTS[currentIndex];
}

function roundedClamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

export function cockpitInputForInteraction(
  interactionId: CockpitInteractionId,
  current: ControlInputs,
): Partial<ControlInputs> | null {
  switch (interactionId) {
    case 'throttle-levers': {
      const nextThrottle = roundedClamp(Math.max(current.throttle1, current.throttle2) + 0.1, 0, 1);
      return { throttle1: nextThrottle, throttle2: nextThrottle };
    }
    case 'flap-lever':
      return { flapLever: nextFlapDetent(current.flapLever) };
    case 'gear-lever':
      return { gearLever: current.gearLever === 'DOWN' ? 'UP' : 'DOWN' };
    case 'speedbrake-lever':
      return { spoilers: current.spoilers > 0.05 ? 0 : 1 };
    case 'yoke':
    case 'mcp-panel':
      return null;
  }
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
