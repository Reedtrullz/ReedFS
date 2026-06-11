import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { RfsPFD } from '../RfsPFD';
import { useSimStore } from '../../store/simStore';
import { computeRouteStatus } from '../../sim/systems/navigation';
import { KSEA_TUTORIAL_SCENARIO } from '../../sim/scenarios';

const KNOT_TO_MPS = 0.514444;

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

  it('shows player-facing takeoff cue and V-speed references on the PFD during the takeoff roll', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.flightPhase = 'TAKEOFF';
    aircraft.config.gearDown = true;
    aircraft.velocity.u = 155 * KNOT_TO_MPS;
    aircraft.position.alt = aircraft.ground.groundAltFt;
    useSimStore.setState({ aircraft, selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id });

    render(<RfsPFD />);

    expect(screen.getByText('TAKEOFF REF')).toBeTruthy();
    expect(screen.getByText('ROTATE — hold W')).toBeTruthy();
    expect(screen.getByText('V1 141')).toBeTruthy();
    expect(screen.getByText('VR 149')).toBeTruthy();
    expect(screen.getByText('V2 155')).toBeTruthy();
  });

  it('shows radio altitude below 2500 ft AGL for takeoff and landing height awareness', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.flightPhase = 'CLIMB';
    aircraft.ground = { ...aircraft.ground, aglFt: 350, groundAltFt: 432, weightOnWheels: false };
    aircraft.position.alt = 782;
    useSimStore.setState({ aircraft });

    render(<RfsPFD />);

    expect(screen.getByLabelText('Radio altitude')).toBeTruthy();
    expect(screen.getByText('RA 350')).toBeTruthy();
  });

  it('hides radio altitude at cruise heights so the PFD does not show stale low-altitude cues', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.flightPhase = 'CRUISE';
    aircraft.ground = { ...aircraft.ground, aglFt: 3_000, groundAltFt: 432, weightOnWheels: false };
    aircraft.position.alt = 3_432;
    useSimStore.setState({ aircraft });

    render(<RfsPFD />);

    expect(screen.queryByLabelText('Radio altitude')).toBeNull();
    expect(screen.queryByText('RA 3000')).toBeNull();
  });

  it('does not round just-below-threshold radio altitude into a misleading RA 2500 annunciation', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.flightPhase = 'APPROACH';
    aircraft.ground = { ...aircraft.ground, aglFt: 2499.6, groundAltFt: 432, weightOnWheels: false };
    aircraft.position.alt = 2931.6;
    useSimStore.setState({ aircraft });

    render(<RfsPFD />);

    expect(screen.queryByText('RA 2500')).toBeNull();
  });

  it('shows MCP selected speed heading altitude and vertical-speed targets on the PFD', () => {
    const ap = apStateWithModes();
    ap.boeing.speed = 245;
    ap.boeing.heading = 272;
    ap.boeing.altitude = 12000;
    ap.boeing.verticalSpeed = -800;
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.getByLabelText('PFD MCP selected targets')).toBeTruthy();
    expect(screen.getByText('SEL SPD 245')).toBeTruthy();
    expect(screen.getByText('SEL HDG 272')).toBeTruthy();
    expect(screen.getByText('SEL ALT 12000')).toBeTruthy();
    expect(screen.getByText('SEL VS -800')).toBeTruthy();
  });

  it('does not invent PFD MCP selected target bugs before an MCP/autopilot state exists', () => {
    render(<RfsPFD />);

    expect(screen.queryByLabelText('PFD MCP selected targets')).toBeNull();
    expect(screen.queryByText(/SEL SPD/)).toBeNull();
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
