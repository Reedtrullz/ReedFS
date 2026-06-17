import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RouteStatus } from '../RouteStatus';
import { useSimStore } from '../../store/simStore';
import type { RouteStatusSnapshot } from '../../sim/systems/navigation';

function routeStatus(overrides: Partial<RouteStatusSnapshot> = {}): RouteStatusSnapshot {
  return {
    routeName: 'KSEA→KPDX',
    routeValid: true,
    routeComplete: false,
    approachHandoff: 'none',
    lnavAvailable: true,
    lnavUnavailableReason: null,
    activeLegIndex: 0,
    activeLegCount: 2,
    fromWaypointIndex: 0,
    toWaypointIndex: 1,
    fromIdent: 'KSEA',
    nextWaypointIdent: 'OLM',
    distanceToNextM: 49300,
    distanceToNextNm: 26.6,
    desiredTrackRad: 2.95,
    desiredTrackDegTrue: 169,
    crossTrackErrorM: 0,
    alongTrackM: 1200,
    legLengthM: 49300,
    nextDesiredTrackRad: null,
    nextDesiredTrackDegTrue: null,
    turnAngleRad: null,
    turnAnticipationDistanceM: null,
    turnAnticipationDistanceNm: null,
    etaMinutes: 7.1,
    waypointReached: false,
    sequenced: false,
    ...overrides,
  };
}

describe('RouteStatus', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders store-owned route feedback without recomputing from the flight plan', () => {
    useSimStore.setState({
      flightPlan: null,
      activeLegIndex: 7,
      routeStatus: routeStatus({
        routeName: 'MOCKA→MOCKB',
        activeLegIndex: 7,
        activeLegCount: 8,
        fromIdent: 'FAKE1',
        nextWaypointIdent: 'FAKE2',
        fromWaypointIndex: 10,
        toWaypointIndex: 42,
        distanceToNextNm: 12.3,
        desiredTrackDegTrue: 87,
        etaMinutes: 4.4,
      }),
    });

    render(<RouteStatus />);

    const routeRegion = screen.getByRole('region', { name: 'Route status' });
    expect(routeRegion).toBeTruthy();
    expect(routeRegion.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByLabelText('Route status')).toBeTruthy();
    expect(screen.getByText('MOCKA→MOCKB')).toBeTruthy();
    expect(screen.getByText(/LEG 8\/8/i)).toBeTruthy();
    expect(screen.getByText(/FAKE1 → FAKE2/i)).toBeTruthy();
    expect(screen.getByText(/12\.3 NM/i)).toBeTruthy();
    expect(screen.getByText(/087°T/i)).toBeTruthy();
    expect(screen.getByText(/4\.4 MIN/i)).toBeTruthy();
    expect(screen.queryByText(/LNAV unavailable/i)).toBeNull();
    expect(useSimStore.getState().routeStatus.activeLegIndex).toBe(7);
  });

  it('labels the current loaded route as a canned training route instead of a full route editor flow', () => {
    useSimStore.setState({ routeStatus: routeStatus() });

    render(<RouteStatus />);

    expect(screen.getByText(/CANNED TRAINING ROUTE/i)).toBeTruthy();
    expect(screen.getByText(/route editing unavailable/i)).toBeTruthy();
    expect(screen.getByText(/RFMS adapter seam only/i)).toBeTruthy();
    expect(screen.getByText(/no CDU\/EXEC route edit UI/i)).toBeTruthy();
    expect(screen.getByText(/synthetic training approach/i)).toBeTruthy();
    expect(screen.getByText(/not official procedure data/i)).toBeTruthy();
  });

  it('labels ENVA→ENGM as a canned synthetic approach training route', () => {
    useSimStore.setState({
      routeStatus: routeStatus({
        routeName: 'ENVA→ENGM',
        activeLegIndex: 0,
        activeLegCount: 6,
        fromIdent: 'ENVA',
        nextWaypointIdent: 'ENVA09_CLB',
      }),
    });

    render(<RouteStatus />);

    expect(screen.getByText('ENVA→ENGM')).toBeTruthy();
    expect(screen.getByText(/CANNED TRAINING ROUTE/i)).toBeTruthy();
    expect(screen.getByText(/synthetic training approach/i)).toBeTruthy();
    expect(screen.getByText(/not official procedure data/i)).toBeTruthy();
  });

  it('keeps pilot-facing leg display coherent if route feedback has an inconsistent leg count', () => {
    useSimStore.setState({
      routeStatus: routeStatus({
        activeLegIndex: 7,
        activeLegCount: 3,
      }),
    });

    render(<RouteStatus />);

    expect(screen.getByText(/LEG 8\/8/i)).toBeTruthy();
    expect(screen.queryByText(/LEG 8\/3/i)).toBeNull();
  });

  it('displays an explicit unavailable reason from route feedback', () => {
    useSimStore.setState({
      routeStatus: routeStatus({
        routeValid: false,
        lnavAvailable: false,
        lnavUnavailableReason: 'missing coordinates for waypoint BROKEN',
        activeLegIndex: null,
        activeLegCount: 0,
        fromWaypointIndex: null,
        toWaypointIndex: null,
        fromIdent: null,
        nextWaypointIdent: null,
        distanceToNextM: null,
        distanceToNextNm: null,
        desiredTrackRad: null,
        desiredTrackDegTrue: null,
        etaMinutes: null,
      }),
    });

    render(<RouteStatus />);

    expect(screen.getByText('KSEA→KPDX')).toBeTruthy();
    expect(screen.getByText(/LNAV unavailable: missing coordinates for waypoint BROKEN/i)).toBeTruthy();
    expect(screen.queryByText(/DTG/i)).toBeNull();
  });

  it('renders an arrived route complete state instead of an active LNAV leg', () => {
    useSimStore.setState({
      routeStatus: routeStatus({
        routeComplete: true,
        lnavAvailable: false,
        lnavUnavailableReason: 'route complete',
        activeLegIndex: 1,
        activeLegCount: 2,
        fromWaypointIndex: 1,
        toWaypointIndex: 2,
        fromIdent: 'OLM',
        nextWaypointIdent: 'KPDX',
        distanceToNextM: 0,
        distanceToNextNm: 0,
        desiredTrackRad: null,
        desiredTrackDegTrue: null,
        etaMinutes: null,
        waypointReached: true,
      }),
    });

    render(<RouteStatus />);

    expect(screen.getByText('KSEA→KPDX')).toBeTruthy();
    expect(screen.getByText(/arrived/i)).toBeTruthy();
    expect(screen.getByText(/route complete/i)).toBeTruthy();
    expect(screen.queryByText(/LNAV unavailable/i)).toBeNull();
    expect(screen.queryByText(/Active/i)).toBeNull();
    expect(screen.queryByText(/OLM → KPDX/i)).toBeNull();
    expect(screen.queryByText(/DTG/i)).toBeNull();
  });

  it('renders a landing-aware threshold handoff instead of only a generic arrived state', () => {
    useSimStore.setState({
      routeStatus: routeStatus({
        routeComplete: true,
        approachHandoff: 'threshold',
        lnavAvailable: false,
        lnavUnavailableReason: 'route complete',
        activeLegIndex: 4,
        activeLegCount: 5,
        fromWaypointIndex: 4,
        toWaypointIndex: 5,
        fromIdent: 'KPDX10R_FAF',
        nextWaypointIdent: 'KPDX10R_RWY',
        distanceToNextM: 0,
        distanceToNextNm: 0,
        desiredTrackRad: null,
        desiredTrackDegTrue: null,
        etaMinutes: null,
        waypointReached: true,
      }),
    });

    render(<RouteStatus />);

    expect(screen.getByText('KSEA→KPDX')).toBeTruthy();
    expect(screen.getByText(/Approach handoff/i)).toBeTruthy();
    expect(screen.getByText(/Threshold/i)).toBeTruthy();
    expect(screen.getByText(/KPDX10R_RWY/i)).toBeTruthy();
    expect(screen.queryByText(/Arrived — route complete/i)).toBeNull();
    expect(screen.queryByText(/LNAV unavailable/i)).toBeNull();
    expect(screen.queryByText(/Active/i)).toBeNull();
  });
});
