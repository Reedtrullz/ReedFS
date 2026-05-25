import { describe, expect, it } from 'vitest';
import type { ControlInputs } from '../../sim/types';
import { applyDiscreteKeyInput, computeHeldKeyInputs } from '../keyboardControls';

const inputs: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0.5,
  throttle2: 0.5,
  flapLever: 0,
  gearLever: 'DOWN',
  spoilers: 0,
  brake: 0,
};

describe('keyboardControls', () => {
  it('computes simultaneous pitch roll and rudder axes from held keys', () => {
    const keys = new Set(['w', 'd', 'q', ' ']);

    expect(computeHeldKeyInputs(keys)).toEqual({
      elevator: -0.5,
      aileron: 0.5,
      rudder: -0.5,
      brake: 1,
    });
  });

  it('increments throttle instead of jumping straight to full power', () => {
    expect(applyDiscreteKeyInput('arrowup', inputs)).toEqual({
      throttle1: 0.55,
      throttle2: 0.55,
    });
  });

  it('clamps throttle at full power when incrementing near max', () => {
    expect(applyDiscreteKeyInput('arrowup', { ...inputs, throttle1: 0.98, throttle2: 0.98 })).toEqual({
      throttle1: 1,
      throttle2: 1,
    });
  });

  it('decrements throttle without going below idle', () => {
    expect(applyDiscreteKeyInput('arrowdown', { ...inputs, throttle1: 0.02, throttle2: 0.02 })).toEqual({
      throttle1: 0,
      throttle2: 0,
    });
  });

  it('toggles gear and cycles flaps', () => {
    expect(applyDiscreteKeyInput('g', inputs)).toEqual({ gearLever: 'UP' });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 0 })).toEqual({ flapLever: 5 });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 5 })).toEqual({ flapLever: 10 });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 40 })).toEqual({ flapLever: 0 });
  });
});
