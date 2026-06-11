import { describe, expect, it } from 'vitest';
import { createDefaultAutopilotState } from '../defaultAutopilotState';
import { deriveDisplayFmaTruth } from '../../sim/systems/fmaTruth';

describe('createDefaultAutopilotState', () => {
  it('keeps raw AP command channels unbacked when AP truth is OFF', () => {
    const ap = createDefaultAutopilotState();

    expect(ap.truth.autopilotStatus).toBe('OFF');
    expect(ap.boeing.cmdA).toBe(false);
    expect(ap.boeing.cmdB).toBe(false);
    expect(ap.boeing.cwsA).toBe(false);
    expect(ap.boeing.cwsB).toBe(false);
    expect(deriveDisplayFmaTruth(ap).autopilotStatus).toBe('OFF');
  });
});
