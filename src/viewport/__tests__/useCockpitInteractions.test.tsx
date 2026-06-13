import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '../../store/simStore';
import { useCockpitInteractions } from '../useCockpitInteractions';

function establishPositiveRateInStore(): void {
  useSimStore.setState((s) => {
    const aircraft = structuredClone(s.aircraft);
    aircraft.flightPhase = 'TAKEOFF';
    aircraft.ground = {
      ...aircraft.ground,
      weightOnWheels: false,
      contact: 'none',
      onRunway: false,
      aglFt: 80,
      normalForceN: 0,
    };
    aircraft.velocity.w = -1.5;
    aircraft.position.alt += 80;
    return { aircraft };
  });
}

describe('useCockpitInteractions', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('applies click-style cockpit input interactions to pilot controls', () => {
    useSimStore.getState().setInput({ throttle1: 0.2, throttle2: 0.25, flapLever: 0, gearLever: 'DOWN' });
    establishPositiveRateInStore();
    const { result } = renderHook(() => useCockpitInteractions());

    let throttleResult: ReturnType<typeof result.current.activateCockpitInteraction> | null = null;
    let flapResult: ReturnType<typeof result.current.activateCockpitInteraction> | null = null;
    let gearResult: ReturnType<typeof result.current.activateCockpitInteraction> | null = null;
    act(() => {
      throttleResult = result.current.activateCockpitInteraction('throttle-levers');
      flapResult = result.current.activateCockpitInteraction('flap-lever');
      gearResult = result.current.activateCockpitInteraction('gear-lever');
    });

    expect(throttleResult).toMatchObject({ status: 'applied', interactionId: 'throttle-levers' });
    expect(flapResult).toMatchObject({ status: 'applied', interactionId: 'flap-lever' });
    expect(gearResult).toMatchObject({ status: 'applied', interactionId: 'gear-lever' });
    const state = useSimStore.getState();
    expect(state.pilotInputs.throttle1).toBe(0.35);
    expect(state.pilotInputs.throttle2).toBe(0.35);
    expect(state.pilotInputs.flapLever).toBe(1);
    expect(state.pilotInputs.gearLever).toBe('UP');
    expect(state.effectiveControls.throttle1).toBe(0.35);
    expect(state.effectiveControls.throttle2).toBe(0.35);
    expect(state.effectiveControls.flapLever).toBe(1);
    expect(state.effectiveControls.gearLever).toBe('UP');
  });

  it('toggles a real MCP flight-director action from the cockpit MCP hotspot', () => {
    const { result } = renderHook(() => useCockpitInteractions());

    let activation: ReturnType<typeof result.current.activateCockpitInteraction> | null = null;
    act(() => {
      activation = result.current.activateCockpitInteraction('mcp-panel');
    });

    expect(activation).toMatchObject({ status: 'applied', interactionId: 'mcp-panel', action: 'mcp-toggle-fd-left' });
    const ap = useSimStore.getState().apState;
    expect(ap?.boeing.fdLeft).toBe(true);
    expect(ap?.truth.autopilotStatus).toBe('OFF');
  });

  it('reports unavailable placeholders without mutating inputs', () => {
    const { result } = renderHook(() => useCockpitInteractions());
    const before = useSimStore.getState().pilotInputs;

    let activation: ReturnType<typeof result.current.activateCockpitInteraction> | null = null;
    act(() => {
      activation = result.current.activateCockpitInteraction('yoke');
    });

    expect(activation).toMatchObject({
      status: 'unavailable',
      interactionId: 'yoke',
      reason: expect.stringMatching(/keyboard|gamepad/i),
    });
    expect(useSimStore.getState().pilotInputs).toBe(before);
  });
});
