export type OverlayMode = 'flight' | 'minimal' | 'debug';

export function nextOverlayMode(mode: OverlayMode): OverlayMode {
  switch (mode) {
    case 'flight':
      return 'minimal';
    case 'minimal':
      return 'debug';
    case 'debug':
      return 'flight';
  }
}

export function shouldShowFlightInstruments(mode: OverlayMode): boolean {
  return mode !== 'minimal';
}

export function shouldShowDebugOverlays(mode: OverlayMode): boolean {
  return mode === 'debug';
}
