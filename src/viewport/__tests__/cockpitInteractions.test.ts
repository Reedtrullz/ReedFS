import { describe, expect, it } from 'vitest';
import type { ControlInputs } from '../../sim/types';
import {
  COCKPIT_INTERACTIONS,
  cockpitInputForInteraction,
  cockpitActionForInteraction,
  interactionForObjectName,
} from '../cockpitInteractions';

const baseInputs: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0.45,
  throttle2: 0.45,
  flapLever: 0,
  gearLever: 'DOWN',
  spoilers: 0,
  brake: 0,
};

describe('cockpitInteractions', () => {
  it('maps visible cockpit parts to stable interaction IDs', () => {
    expect(COCKPIT_INTERACTIONS.map((entry) => entry.objectName)).toEqual(expect.arrayContaining([
      'yoke',
      'throttleLever1',
      'throttleLever2',
      'flapLever',
      'gearLever',
      'speedbrakeLever',
      'mcpPanel',
    ]));
    expect(interactionForObjectName('throttleLever2')?.id).toBe('throttle-levers');
  });

  it('converts lever clicks into pilot-owned input patches', () => {
    expect(cockpitInputForInteraction('throttle-levers', baseInputs)).toEqual({ throttle1: 0.55, throttle2: 0.55 });
    expect(cockpitInputForInteraction('flap-lever', baseInputs)).toEqual({ flapLever: 1 });
    expect(cockpitInputForInteraction('gear-lever', baseInputs)).toEqual({ gearLever: 'UP' });
    expect(cockpitInputForInteraction('speedbrake-lever', baseInputs)).toEqual({ spoilers: 1 });
  });

  it('cycles flaps through documented Boeing-style detents and clamps throttle clicks', () => {
    expect(cockpitInputForInteraction('flap-lever', { ...baseInputs, flapLever: 1 })).toEqual({ flapLever: 2 });
    expect(cockpitInputForInteraction('flap-lever', { ...baseInputs, flapLever: 30 })).toEqual({ flapLever: 40 });
    expect(cockpitInputForInteraction('flap-lever', { ...baseInputs, flapLever: 40 })).toEqual({ flapLever: 0 });
    expect(cockpitInputForInteraction('throttle-levers', { ...baseInputs, throttle1: 0.98, throttle2: 0.99 })).toEqual({ throttle1: 1, throttle2: 1 });
  });

  it('classifies real, MCP, and unavailable cockpit hotspots without null/no-op actions', () => {
    const yoke = interactionForObjectName('yoke');
    const mcp = interactionForObjectName('mcpPanel');

    expect(yoke).toMatchObject({
      id: 'yoke',
      availability: 'unavailable',
      unavailableReason: expect.stringMatching(/keyboard|gamepad/i),
    });
    expect(mcp).toMatchObject({
      id: 'mcp-panel',
      availability: 'available',
    });
    expect(cockpitActionForInteraction('mcp-panel', baseInputs)).toEqual({
      kind: 'mcp-toggle-fd-left',
    });
    expect(cockpitActionForInteraction('yoke', baseInputs)).toEqual({
      kind: 'unavailable',
      reason: yoke?.unavailableReason,
    });
  });
});
