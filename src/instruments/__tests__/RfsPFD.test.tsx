import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { RfsPFD } from '../RfsPFD';
import { useSimStore } from '../../store/simStore';
import { computeRouteStatus } from '../../sim/systems/navigation';

function apStateWithModes(): AutopilotState {
  return {
    boeing: {
      courseL: 0,
      courseR: 0,
      speed: 250,
      mach: null,
      heading: 180,
      altitude: 10000,
      verticalSpeed: null,
      fdLeft: true,
      fdRight: true,
      autothrottleArm: true,
      n1: false,
      speedMode: true,
      lnav: true,
      vnav: true,
      lvlChg: false,
      hdgSel: false,
      vorLoc: false,
      app: false,
      altHold: false,
      vs: false,
      cmdA: true,
      cmdB: false,
      cwsA: false,
      cwsB: false,
    },
    airbus: {
      speed: null,
      speedManaged: false,
      heading: null,
      headingManaged: false,
      altitude: 10000,
      altitudeManaged: false,
      verticalSpeed: null,
      fpa: null,
      fd1: false,
      fd2: false,
      athr: false,
      ap1: false,
      ap2: false,
      loc: false,
      appr: false,
      exped: false,
      hdgTrkMode: 'HDG_VS',
      metricAltitude: false,
      speedMachMode: 'SPD',
    },
    truth: {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: 'VNAV',
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
    },
  };
}

function routeWithAltitudeConstraint(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'TST800',
    route: 'KSEA OLM',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, altitudeConstraint: { type: 'AT', altitude: 10000 } },
    ],
  };
}

function setAircraftOnKseaRoute() {
  const aircraft = structuredClone(useSimStore.getState().aircraft);
  aircraft.position.lat = 47.45;
  aircraft.position.lon = -122.31;
  aircraft.position.alt = 5000;
  aircraft.velocity.u = 128.6;
  const flightPlan = routeWithAltitudeConstraint();
  const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);
  useSimStore.setState({ aircraft, flightPlan, activeLegIndex: 0, routeStatus });
}

describe('RfsPFD', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('renders a readable PFD frame with labeled speed, altitude, attitude, and heading sections', () => {
    render(<RfsPFD />);

    expect(screen.getByLabelText('Primary flight display')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed tape')).toBeTruthy();
    expect(screen.getByLabelText('Altitude tape')).toBeTruthy();
    expect(screen.getByText('IAS')).toBeTruthy();
    expect(screen.getByText('ALT')).toBeTruthy();
    expect(screen.getByText('ATT')).toBeTruthy();
    expect(screen.getByText('HDG')).toBeTruthy();
  });

  it('shows FMA truth modes instead of burying autopilot status in debug telemetry', () => {
    setAircraftOnKseaRoute();
    useSimStore.getState().setApState(apStateWithModes());

    render(<RfsPFD />);

    expect(screen.getByText('FMA')).toBeTruthy();
    expect(screen.getByText('SPEED')).toBeTruthy();
    expect(screen.getByText('LNAV')).toBeTruthy();
    expect(screen.getByText('VNAV_PTH')).toBeTruthy();
    expect(screen.getByText('CMD_A')).toBeTruthy();
  });

  it('shows N1 as an honest FMA thrust mode when truth state is N1', () => {
    const ap = apStateWithModes();
    ap.truth.thrustActive = 'N1';
    ap.boeing.n1 = true;
    ap.boeing.speedMode = false;
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.getByText('N1')).toBeTruthy();
  });

  it('does not display raw LNAV or VNAV FMA modes when route guidance is unavailable', () => {
    useSimStore.getState().setApState(apStateWithModes());

    render(<RfsPFD />);

    expect(screen.getByText('FMA')).toBeTruthy();
    expect(screen.queryByText('LNAV')).toBeNull();
    expect(screen.queryByText('VNAV')).toBeNull();
  });
});
