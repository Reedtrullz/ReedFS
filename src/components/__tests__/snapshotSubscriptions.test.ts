import { describe, expect, it } from 'vitest';
import pfdSource from '../../instruments/RfsPFD.tsx?raw';
import fpsMonitorSource from '../FPSMonitor.tsx?raw';
import telemetrySource from '../Telemetry.tsx?raw';

describe('instrument/debug store subscriptions', () => {
  it('does not subscribe PFD or debug telemetry to the full aircraft snapshot object', () => {
    expect(pfdSource).not.toMatch(/useSimStore\(\(s\) => s\.aircraft\)/);
    expect(telemetrySource).not.toMatch(/useSimStore\(\(s\) => s\.aircraft\)/);
    expect(telemetrySource).not.toMatch(/const aircraft = useSimStore/);
  });

  it('keeps debug FPS monitoring free of synchronous canvas/WebGL readbacks', () => {
    expect(fpsMonitorSource).not.toMatch(/\b(readPixels|getImageData|toDataURL|toBlob|getContext)\b/);
  });
});
