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
    useSimStore.getState().setInput({ flapLever: 0, gearLever: 'DOWN' });
    establishPositiveRateInStore();
    const { result } = renderHook(() => useCockpitInteractions());

    act(() => {
      expect(result.current.activateCockpitInteraction('flap-lever')).toBe(true);
      expect(result.current.activateCockpitInteraction('gear-lever')).toBe(true);
    });

    const state = useSimStore.getState();
    expect(state.pilotInputs.flapLever).toBe(1);
    expect(state.pilotInputs.gearLever).toBe('UP');
    expect(state.effectiveControls.flapLever).toBe(1);
    expect(state.effectiveControls.gearLever).toBe('UP');
  });

  it('reports drag-only placeholders without mutating inputs', () => {
    const { result } = renderHook(() => useCockpitInteractions());
    const before = useSimStore.getState().pilotInputs;

    act(() => {
      expect(result.current.activateCockpitInteraction('yoke')).toBe(false);
    });

    expect(useSimStore.getState().pilotInputs).toBe(before);
  });
});
