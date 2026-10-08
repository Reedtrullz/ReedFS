import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RfsPFD } from '../RfsPFD';
import { useSimStore } from '../../store/simStore';
import { createDefaultAutopilotState } from '../defaultAutopilotState';
import { selectPfdAltitude, selectPfdFmaText, selectPfdIas, selectPfdSelectedAltitude } from '../../store/selectors';
import { mainThreadSimulationRuntime, setSimulationRuntimeForTests } from '../../sim/simulationRuntime';

beforeEach(() => {
  setSimulationRuntimeForTests(mainThreadSimulationRuntime);
  useSimStore.getState().reset(); useSimStore.getState().start();
  const s = useSimStore.getState(); const ap = createDefaultAutopilotState();
  ap.boeing.cmdA = true; ap.boeing.hdgSel = true; ap.boeing.altHold = true;
  ap.truth.autopilotStatus = 'CMD_A'; ap.truth.lateralActive = 'HDG_SEL'; ap.truth.verticalActive = 'ALT_HOLD';
  useSimStore.setState({ aircraft: { ...s.aircraft, position: { ...s.aircraft.position, alt: 5000 },
    velocity: { u: 120, v: 0, w: 0 }, ground: { ...s.aircraft.ground, weightOnWheels: false, aglFt: 4500 }, flightPhase: 'CRUISE' } });
  useSimStore.getState().setApState(ap); useSimStore.getState().tick(16);
  expect(useSimStore.getState().simulationCommit).not.toBeNull();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('keeps observed altitude, airspeed and FMA on one commit while selections are immediate', () => {
  const initial = useSimStore.getState();
  const altitude = selectPfdAltitude(initial); const ias = selectPfdIas(initial); const fma = selectPfdFmaText('autopilotStatus')(initial);
  expect(fma).toBe('CMD_A');
  const ap = createDefaultAutopilotState(); ap.boeing.altitude = 23000;
  useSimStore.getState().setApState(ap);
  useSimStore.getState().setWeather({ ...initial.weather!, qnhHpa: 980 });
  useSimStore.getState().setWind({ speed: 40, dir: 180, gustSpeed: 40 });
  const pending = useSimStore.getState();
  expect(selectPfdSelectedAltitude(pending)).toBe(23000);
  expect(selectPfdAltitude(pending)).toBe(altitude); expect(selectPfdIas(pending)).toBe(ias);
  expect(selectPfdFmaText('autopilotStatus')(pending)).toBe(fma);
  render(<RfsPFD />);
  expect(screen.getByLabelText('PFD observation state')).toHaveTextContent('WAITING');
  expect(screen.getByLabelText('PFD MCP selected targets')).toHaveTextContent('23000');
});

it('ages unchanged observations and distinguishes pause from invalid data', () => {
  vi.useFakeTimers(); const clock = vi.spyOn(performance, 'now');
  const s = useSimStore.getState(); clock.mockReturnValue(s.simulationCommit!.committedAtMs + 100);
  render(<RfsPFD />);
  expect(screen.getByLabelText('PFD observation state')).toHaveTextContent('CURRENT');
  clock.mockReturnValue(s.simulationCommit!.committedAtMs + 1600);
  act(() => vi.advanceTimersByTime(250));
  expect(screen.getByLabelText('PFD observation state')).toHaveTextContent('STALE');
  act(() => useSimStore.getState().pause());
  expect(screen.getByLabelText('PFD observation state')).toHaveTextContent('PAUSED');
  act(() => useSimStore.setState({ simulationFailure: { message: 'invalid result', detectedAtIso: '2026-10-08T00:00:00Z', input: {}, result: {}, checkpoint: null, recovered: false } }));
  expect(screen.getByLabelText('PFD observation state')).toHaveTextContent('INVALID');
});
