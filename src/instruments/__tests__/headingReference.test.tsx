import { afterEach, beforeEach, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RfsMCP } from '../RfsMCP';
import { RfsPFD } from '../RfsPFD';
import { HeadingReferenceControl } from '../../components/HeadingReferenceControl';
import { createDefaultAutopilotState } from '../defaultAutopilotState';
import { useSimStore } from '../../store/simStore';
import { useHeadingReferenceStore } from '../../store/headingReferenceStore';
import { captureScenarioSnapshot } from '../../store/scenarioPersistence';
import { eulerToQuat } from '../../sim/physics/quaternion';
import { wmm2025Field } from '../../sim/magneticHeading';

beforeEach(() => {
  useSimStore.getState().setScenario('ksea-tutorial');
  useHeadingReferenceStore.getState().setReference('true');
  const ap = createDefaultAutopilotState(); ap.boeing.heading = 90;
  useSimStore.setState({ apState: ap });
});
afterEach(() => { cleanup(); useHeadingReferenceStore.getState().setReference('true'); });

it('labels the existing selected physical heading as true rather than leaving its reference implicit', () => {
  render(<RfsMCP />);
  expect(screen.getByText('HDG 090T')).toBeVisible();
});

function magneticPoint() {
  const aircraft = structuredClone(useSimStore.getState().aircraft);
  aircraft.position = { lat: 80, lon: 0, alt: 35_000 };
  aircraft.utcEpochMs = Date.UTC(2025, 0, 1); aircraft.simTime = 0; aircraft.timeOfDay = 0;
  aircraft.quaternion = eulerToQuat(0, 0, 70 * Math.PI / 180);
  aircraft.ground = { ...aircraft.ground, weightOnWheels: false, contact: 'none', aglFt: 35_000 };
  aircraft.flightPhase = 'CRUISE';
  const ap = createDefaultAutopilotState(); ap.boeing.heading = 90.49; ap.boeing.hdgSel = true; ap.boeing.fdLeft = true;
  ap.truth.lateralActive = 'HDG_SEL';
  ap.boeing.cmdA = true; ap.truth.autopilotStatus = 'CMD_A';
  useSimStore.setState({ aircraft, apState: ap, simulationCommit: null });
  const result = wmm2025Field({ latitudeDeg: 80, longitudeDeg: 0, heightAboveEllipsoidKm: 0, utcMs: aircraft.utcEpochMs });
  if (!result.ok) throw new Error('qualified nonzero variation fixture unavailable');
  return result.declinationEastDeg;
}

function invariantState() {
  const state = useSimStore.getState();
  const snapshot = { ...captureScenarioSnapshot(state), savedAtIso: '' };
  return { snapshot, generation: state.asyncPhysicsGeneration, commands: state.commandRevisions, routeStatus: state.routeStatus };
}

it('switches MCP/PFD/bug display without changing physical state, true AP targets, FD guidance or saved flight', () => {
  magneticPoint(); render(<><HeadingReferenceControl /><RfsMCP /><RfsPFD /></>);
  const before = invariantState(); const fd = screen.getByTestId('fd-roll-command').outerHTML;
  fireEvent.change(screen.getByLabelText('Heading reference'), { target: { value: 'magnetic' } });
  expect(screen.getByText('HDG 089M SFC')).toBeVisible();
  expect(screen.getByLabelText('Heading selected bug')).toHaveTextContent('HDG BUG 089M SFC');
  expect(screen.getByLabelText('PFD heading')).toHaveTextContent('069M SFC');
  expect(invariantState()).toEqual(before);
  expect(screen.getByTestId('fd-roll-command').outerHTML).toBe(fd);
  fireEvent.change(screen.getByLabelText('Heading reference'), { target: { value: 'true' } });
  expect(screen.getByText('HDG 090T')).toBeVisible(); expect(invariantState()).toEqual(before);
});

it('converts a magnetic MCP step once from the displayed target into a true persisted AP command', () => {
  const variation = magneticPoint(); act(() => useHeadingReferenceStore.getState().setReference('magnetic'));
  const aircraft = structuredClone(useSimStore.getState().aircraft); render(<RfsMCP />);
  fireEvent.click(screen.getByLabelText('HDG +5'));
  expect(useSimStore.getState().apState?.boeing.heading).toBeCloseTo(94 + variation, 10);
  expect(screen.getByText('HDG 094M SFC')).toBeVisible();
  expect(useSimStore.getState().aircraft).toEqual(aircraft);
  fireEvent.click(screen.getByLabelText('HDG -5'));
  expect(useSimStore.getState().apState?.boeing.heading).toBeCloseTo(89 + variation, 10);
});

it('updates variation for date and location without redirecting AP, and rejects magnetic commands when unavailable', () => {
  magneticPoint(); act(() => useHeadingReferenceStore.getState().setReference('magnetic'));
  render(<RfsMCP />); const heading = useSimStore.getState().apState?.boeing.heading;
  act(() => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.utcEpochMs = Date.UTC(2027, 6, 2, 12); aircraft.timeOfDay = 12;
    useSimStore.setState({ aircraft });
  });
  expect(screen.getByText('HDG 088M SFC')).toBeVisible(); expect(useSimStore.getState().apState?.boeing.heading).toBe(heading);
  act(() => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.position = { lat: 0, lon: 120, alt: 35_000 };
    useSimStore.setState({ aircraft });
  });
  expect(screen.queryByText('HDG 088M SFC')).not.toBeInTheDocument();
  expect(useSimStore.getState().apState?.boeing.heading).toBe(heading);
  act(() => useSimStore.getState().setScenarioUtc('2030-01-01T00:00:00Z'));
  expect(screen.getByText('HDG 090T')).toBeVisible();
  expect(screen.getByLabelText('MCP heading reference warning')).toHaveTextContent('MAG unavailable: unsupported epoch');
  const before = invariantState(); expect(screen.getByLabelText('HDG +5')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('HDG +5')); expect(invariantState()).toEqual(before);
  expect(useHeadingReferenceStore.getState().setReference('grid')).toBe(false);
  expect(useHeadingReferenceStore.getState().reference).toBe('magnetic');
});

it('shows weak-field caution on each magnetic heading and refuses actual blackout-zone commands', () => {
  magneticPoint(); act(() => {
    const aircraft = structuredClone(useSimStore.getState().aircraft); aircraft.position.lat = 85;
    useSimStore.setState({ aircraft }); useHeadingReferenceStore.getState().setReference('magnetic');
  });
  render(<><RfsMCP /><RfsPFD /></>);
  expect(screen.getByText('HDG 086M SFC !')).toBeVisible();
  expect(screen.getByLabelText('Heading selected bug')).toHaveTextContent('086M SFC !');
  expect(screen.getByLabelText('PFD heading')).toHaveTextContent('M SFC !');
  expect(screen.getByLabelText('MCP heading reference warning')).toHaveTextContent('caution');
  expect(screen.getByLabelText('HDG +5')).not.toBeDisabled();
  act(() => {
    const aircraft = structuredClone(useSimStore.getState().aircraft); aircraft.position.lat = 89.9;
    useSimStore.setState({ aircraft });
  });
  expect(screen.getByText('HDG 090T')).toBeVisible();
  expect(screen.getByLabelText('PFD heading reference warning')).toHaveTextContent('weak horizontal field');
  const before = invariantState(); fireEvent.click(screen.getByLabelText('HDG +5'));
  expect(screen.getByLabelText('HDG +5')).toBeDisabled(); expect(invariantState()).toEqual(before);
});
