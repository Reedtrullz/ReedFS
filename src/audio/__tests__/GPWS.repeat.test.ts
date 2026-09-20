import { describe, expect, it, vi } from 'vitest';
import { resetGPWS, updateGPWS } from '../GPWS';
import {
  B737_800_SPEC,
  createInitialState,
} from '../../sim/types';

function alertState(): ReturnType<typeof createInitialState> {
  const state = createInitialState(B737_800_SPEC);
  return {
    ...state,
    position: { ...state.position, alt: 600 },
    ground: { ...state.ground, aglFt: 600, groundAltFt: 0, weightOnWheels: false },
    velocity: { ...state.velocity, u: 90, v: 0, w: 16 },
    flightPhase: 'DESCENT' as const,
  };
}

describe('GPWS repeat and reset', () => {
  it('re-fires a persistent PULL UP alert after the repeat interval', () => {
    resetGPWS();
    const onCaption = vi.fn();
    const state = alertState();

    updateGPWS(state, { nowMs: 10_000, captionsEnabled: true, speechEnabled: false, onCaption });
    updateGPWS(state, { nowMs: 12_000, captionsEnabled: true, speechEnabled: false, onCaption });
    updateGPWS(state, { nowMs: 13_500, captionsEnabled: true, speechEnabled: false, onCaption });

    expect(onCaption).toHaveBeenCalledTimes(2);
    expect(onCaption).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: 'PULL UP', timestampMs: 13_500 }));
  });

  it('resetGPWS allows an immediate callout after scenario reset', () => {
    resetGPWS();
    const onCaption = vi.fn();
    const state = alertState();

    updateGPWS(state, { nowMs: 20_000, captionsEnabled: true, speechEnabled: false, onCaption });
    resetGPWS();
    updateGPWS(state, { nowMs: 20_200, captionsEnabled: true, speechEnabled: false, onCaption });

    expect(onCaption).toHaveBeenCalledTimes(2);
  });

  it('suppresses BANK ANGLE below 500 ft AGL', () => {
    resetGPWS();
    const onCaption = vi.fn();
    const state = alertState();
    const banked = {
      ...state,
      ground: { ...state.ground, aglFt: 300 },
    };

    updateGPWS(banked, { nowMs: 1_000, captionsEnabled: true, speechEnabled: false, onCaption });

    expect(onCaption).not.toHaveBeenCalled();
  });
});
