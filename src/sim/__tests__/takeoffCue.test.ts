import { describe, expect, it } from 'vitest';
import { createInitialState, B737_800_SPEC } from '../types';
import { takeoffCueText } from '../takeoffCue';
import { KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO } from '../scenarios';

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

  it('shows rotate at or above the fallback rotate speed while gear is down', () => {
    const { state, iasKt } = stateAtIas(145);
    expect(takeoffCueText(state, iasKt)).toBe('ROTATE — hold W');
  });

  it('uses scenario performance-card VR when a card exists', () => {
    const { state } = stateAtIas(138);

    expect(takeoffCueText(state, 138, KSEA_LIGHT_PATTERN_SCENARIO.id)).toBe('ROTATE — hold W');
    expect(takeoffCueText(state, 145, KSEA_TUTORIAL_SCENARIO.id)).toBe('TAKEOFF ROLL');
    expect(takeoffCueText(state, 149, KSEA_TUTORIAL_SCENARIO.id)).toBe('ROTATE — hold W');
  });

  it('shows positive rate after airborne climb starts', () => {
    const { state, iasKt } = stateAtIas(155);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = -1.5;
    state.position.alt += 80;
    state.config.gearDown = true;
    expect(takeoffCueText(state, iasKt)).toBe('POSITIVE RATE — gear up');
  });

  it('keeps rotate cue while airborne above the runway but descending', () => {
    const { state, iasKt } = stateAtIas(155);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = 2;
    state.position.alt += 80;
    state.config.gearDown = true;

    expect(takeoffCueText(state, iasKt)).not.toContain('POSITIVE RATE');
    expect(takeoffCueText(state, iasKt)).toBe('ROTATE — hold W');
  });

  it('clears takeoff cue after gear up while airborne', () => {
    const { state } = stateAtIas(155);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = -1.5;
    state.position.alt += 80;
    state.config.gearDown = false;
    expect(takeoffCueText(state, 155)).toBeNull();
  });

  it('continues showing a gear-up cue in climb if gear remains down', () => {
    const { state } = stateAtIas(170);
    state.flightPhase = 'CLIMB';
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 300;
    state.velocity.w = -1.5;
    state.position.alt += 300;
    state.config.gearDown = true;

    expect(takeoffCueText(state, 170)).toBe('GEAR UP');
  });

  it('does not cue gear up in climb phase until positive rate is established', () => {
    const { state } = stateAtIas(170);
    state.flightPhase = 'CLIMB';
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = 2;
    state.position.alt += 80;
    state.config.gearDown = true;

    expect(takeoffCueText(state, 170)).toBeNull();
  });

  it('returns null outside takeoff phase', () => {
    const state = createInitialState(B737_800_SPEC);
    expect(takeoffCueText(state, 0)).toBeNull();
  });
});
