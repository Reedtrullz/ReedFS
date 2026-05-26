import { describe, expect, it } from 'vitest';
import { nextOverlayMode, shouldShowDebugOverlays, shouldShowFlightInstruments, type OverlayMode } from '../overlayMode';

describe('overlayMode', () => {
  it('cycles through flight, minimal, and debug overlays', () => {
    const cycle: OverlayMode[] = [];
    let mode: OverlayMode = 'flight';
    for (let i = 0; i < 4; i++) {
      cycle.push(mode);
      mode = nextOverlayMode(mode);
    }

    expect(cycle).toEqual(['flight', 'minimal', 'debug', 'flight']);
  });

  it('keeps debug clutter hidden unless debug mode is selected', () => {
    expect(shouldShowDebugOverlays('flight')).toBe(false);
    expect(shouldShowDebugOverlays('minimal')).toBe(false);
    expect(shouldShowDebugOverlays('debug')).toBe(true);
  });

  it('keeps flight instruments in flight and debug modes but removes them for the minimal outside view', () => {
    expect(shouldShowFlightInstruments('flight')).toBe(true);
    expect(shouldShowFlightInstruments('minimal')).toBe(false);
    expect(shouldShowFlightInstruments('debug')).toBe(true);
  });
});
