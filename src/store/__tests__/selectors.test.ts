import { describe, expect, it } from 'vitest';
import pfdSource from '../../instruments/RfsPFD.tsx?raw';
import mcpSource from '../../instruments/RfsMCP.tsx?raw';
import telemetrySource from '../../components/Telemetry.tsx?raw';
import engineStripSource from '../../components/EngineStrip.tsx?raw';

describe('stable simulator view selectors', () => {
  it('routes high-frequency instrument subscriptions through selector helpers', () => {
    expect(pfdSource).toMatch(/selectPfd/);
    expect(mcpSource).toMatch(/selectMcpViewModel/);
    expect(telemetrySource).toMatch(/selectTelemetryViewModel/);
    expect(engineStripSource).toMatch(/selectEngineStripViewModel/);
  });

  it('keeps target components away from object-snapshot subscriptions that churn on every aircraft clone', () => {
    for (const source of [pfdSource, mcpSource, telemetrySource, engineStripSource]) {
      expect(source).not.toMatch(/useSimStore\(\(s\) => s\.aircraft\)/);
      expect(source).not.toMatch(/useSimStore\(\(s\) => s\.aircraft\.engines\)/);
      expect(source).not.toMatch(/useSimStore\(\(s\) => s\.effectiveControls\)/);
    }
  });
});
