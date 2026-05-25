import { describe, expect, it } from 'vitest';
import { createInitialState, B737_800_SPEC } from '../types';
import { takeoffCueText } from '../takeoffCue';

function stateAtIas(iasKt: number) {
  const state = createInitialState(B737_800_SPEC);
  state.flightPhase = 'TAKEOFF';
  state.config.gearDown = true;
  return { state, iasKt };
}

describe('takeoffCueText', () => {
  it('shows takeoff roll below rotate speed', () => {
    const { state, iasKt } = stateAtIas(80);
    expect(takeoffCueText(state, iasKt)).toBe('TAKEOFF ROLL');
  });

  it('shows rotate at or above rotate speed while gear is down', () => {
    const { state, iasKt } = stateAtIas(145);
    expect(takeoffCueText(state, iasKt)).toBe('ROTATE — hold W');
  });

  it('shows positive rate after airborne climb starts', () => {
    const { state, iasKt } = stateAtIas(155);
    state.position.alt += 80;
    state.config.gearDown = true;
    expect(takeoffCueText(state, iasKt)).toBe('POSITIVE RATE — gear up');
  });

  it('clears takeoff cue after gear up while airborne', () => {
    const { state } = stateAtIas(155);
    state.position.alt += 80;
    state.config.gearDown = false;
    expect(takeoffCueText(state, 155)).toBeNull();
  });

  it('returns null outside takeoff phase', () => {
    const state = createInitialState(B737_800_SPEC);
    expect(takeoffCueText(state, 0)).toBeNull();
  });
});
