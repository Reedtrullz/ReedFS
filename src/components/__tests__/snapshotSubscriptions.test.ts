import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import pfdSource from '../../instruments/RfsPFD.tsx?raw';
import fpsMonitorSource from '../FPSMonitor.tsx?raw';
import telemetrySource from '../Telemetry.tsx?raw';
import engineStripSource from '../EngineStrip.tsx?raw';
import mcpSource from '../../instruments/RfsMCP.tsx?raw';
import { useSimStore } from '../../store/simStore';
import {
  selectEngineStripViewModel,
  selectMcpViewModel,
  selectTelemetryViewModel,
} from '../../store/selectors';

function cloneAircraftWithUnrelatedPositionNudge() {
  const state = useSimStore.getState();
  const aircraft = structuredClone(state.aircraft);
  aircraft.position.lat += 1e-9;
  useSimStore.setState({
    aircraft,
    simulationTimeSeconds: state.simulationTimeSeconds + 1 / 60,
  });
}

function expectStableAcrossUnrelatedAircraftClones<T>(selector: (state: ReturnType<typeof useSimStore.getState>) => T) {
  let renderCount = 0;
  const { unmount } = renderHook(() => {
    renderCount += 1;
    return useSimStore(selector);
  });
  expect(renderCount).toBe(1);

  act(() => {
    for (let i = 0; i < 300; i += 1) cloneAircraftWithUnrelatedPositionNudge();
  });

  expect(renderCount).toBe(1);
  unmount();
}

describe('instrument/debug store subscriptions', () => {
  beforeEach(() => useSimStore.getState().reset());

  it('does not subscribe PFD or debug telemetry to the full aircraft snapshot object', () => {
    expect(pfdSource).not.toMatch(/useSimStore\(\(s\) => s\.aircraft\)/);
    expect(telemetrySource).not.toMatch(/useSimStore\(\(s\) => s\.aircraft\)/);
    expect(telemetrySource).not.toMatch(/const aircraft = useSimStore/);
  });

  it('routes target displays through stable selector helpers', () => {
    expect(pfdSource).toMatch(/selectPfd/);
    expect(mcpSource).toMatch(/selectMcpViewModel/);
    expect(telemetrySource).toMatch(/selectTelemetryViewModel/);
    expect(engineStripSource).toMatch(/selectEngineStripViewModel/);
  });

  it('does not rerender stable view models on 300 unrelated aircraft snapshot clones', () => {
    expectStableAcrossUnrelatedAircraftClones(selectEngineStripViewModel);
    expectStableAcrossUnrelatedAircraftClones(selectMcpViewModel);
    expectStableAcrossUnrelatedAircraftClones(selectTelemetryViewModel);
  });

  it('keeps debug FPS monitoring free of synchronous canvas/WebGL readbacks', () => {
    expect(fpsMonitorSource).not.toMatch(/\b(readPixels|getImageData|toDataURL|toBlob|getContext)\b/);
  });
});
