import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { RfsPFD, deriveFlightDirectorCue } from '../RfsPFD';
import { useSimStore } from '../../store/simStore';
import { computeRouteStatus } from '../../sim/systems/navigation';
import { eulerToQuat } from '../../sim/physics/quaternion';
import { KSEA_TUTORIAL_SCENARIO } from '../../sim/scenarios';

const KNOT_TO_MPS = 0.514444;
const M_PER_NM = 1852;

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

function routeWithSpeedOnlyConstraint(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'TST222',
    route: 'KSEA OLM SPEED',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, speedConstraint: { type: 'AT_OR_BELOW', speed: 210 } },
    ],
  };
}

function routeWithFutureDescentConstraint(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'TST214',
    route: 'KSEA OLM BTG KPDX',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false },
      { ident: 'BTG', lat: 45.75, lon: -122.59, discontinuity: false, altitudeConstraint: { type: 'AT_OR_BELOW', altitude: 12000 }, speedConstraint: { type: 'AT_OR_BELOW', speed: 280 } },
      { ident: 'KPDX', lat: 45.59, lon: -122.6, discontinuity: false },
    ],
  };
}

function setAircraftOnSpeedOnlyRoute() {
  const aircraft = structuredClone(useSimStore.getState().aircraft);
  aircraft.position.lat = 47.45;
  aircraft.position.lon = -122.31;
  aircraft.position.alt = 5_000;
  aircraft.velocity.u = 128.6;
  aircraft.ground = { ...aircraft.ground, aglFt: 3_000, groundAltFt: 432, weightOnWheels: false };
  const flightPlan = routeWithSpeedOnlyConstraint();
  const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);
  useSimStore.setState({ aircraft, flightPlan, activeLegIndex: 0, routeStatus });
}

function setAircraftBeforeTodFutureConstraint() {
  const aircraft = structuredClone(useSimStore.getState().aircraft);
  aircraft.position.lat = 47.45;
  aircraft.position.lon = -122.31;
  aircraft.position.alt = 30000;
  aircraft.velocity.u = 128.6;
  const flightPlan = routeWithFutureDescentConstraint();
  const routeStatus = {
    ...computeRouteStatus(aircraft, flightPlan, 0),
    routeValid: true,
    routeComplete: false,
    lnavAvailable: true,
    lnavUnavailableReason: null,
    activeLegIndex: 0,
    activeLegCount: 3,
    fromWaypointIndex: 0,
    toWaypointIndex: 1,
    fromIdent: 'KSEA',
    nextWaypointIdent: 'OLM',
    distanceToNextM: 160 * M_PER_NM,
    distanceToNextNm: 160,
    desiredTrackRad: 0,
    desiredTrackDegTrue: 0,
    crossTrackErrorM: 0,
    alongTrackM: 0,
    legLengthM: 180 * M_PER_NM,
    waypointReached: false,
    sequenced: false,
  };
  useSimStore.setState({ aircraft, flightPlan, activeLegIndex: 0, routeStatus });
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
    expect(screen.getByRole('region', { name: 'Primary flight display' })).toBeTruthy();
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

  it('shows managed speed from a speed-only VNAV constraint without vertical FMA or pitch guidance', () => {
    setAircraftOnSpeedOnlyRoute();
    const ap = apStateWithModes();
    ap.boeing.speed = null;
    ap.truth.verticalActive = 'VNAV';
    ap.boeing.vnav = true;
    ap.boeing.fdLeft = true;
    ap.boeing.fdRight = true;
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.getByText('MAN SPD 210')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed managed bug')).toBeTruthy();
    expect(screen.getByText('SPD BUG 210')).toBeTruthy();
    expect(screen.getByText('OFF')).toBeTruthy();
    expect(screen.queryByText('VNAV')).toBeNull();
    expect(screen.queryByLabelText('Flight director pitch bar')).toBeNull();
  });

  it('draws selected speed and altitude bugs on the IAS and ALT tapes when targets are in range', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.velocity.u = 240 * KNOT_TO_MPS;
    aircraft.position.alt = 11_800;
    aircraft.ground = { ...aircraft.ground, aglFt: 3_000, groundAltFt: 432, weightOnWheels: false };
    const ap = apStateWithModes();
    ap.boeing.speed = 245;
    ap.boeing.altitude = 12_000;
    useSimStore.setState({ aircraft });
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.getByLabelText('Airspeed selected bug')).toBeTruthy();
    expect(screen.getByText('SPD BUG 245')).toBeTruthy();
    expect(screen.getByLabelText('Altitude selected bug')).toBeTruthy();
    expect(screen.getByText('ALT BUG 12000')).toBeTruthy();
  });

  it('shows selected heading and vertical-speed bugs in the PFD footer when MCP targets exist', () => {
    const ap = apStateWithModes();
    ap.boeing.heading = 185;
    ap.boeing.verticalSpeed = 700;
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.getByLabelText('Heading selected bug')).toBeTruthy();
    expect(screen.getByText('HDG BUG 185')).toBeTruthy();
    expect(screen.getByLabelText('Vertical speed selected bug')).toBeTruthy();
    expect(screen.getByText('VS BUG +700')).toBeTruthy();
  });

  it('derives Flight Director command bars from supported supplied shared targets rather than recomputing route state', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.position.alt = 9_000;
    aircraft.velocity.u = 128.6;

    const cue = deriveFlightDirectorCue({
      enabled: true,
      lateralMode: 'OFF',
      verticalMode: 'OFF',
      currentHeadingDeg: 180,
      currentRollDeg: 0,
      currentPitchDeg: 0,
      currentVerticalSpeedFpm: 0,
      altitudeFt: 9_000,
      selectedHeadingDeg: null,
      selectedAltitudeFt: null,
      selectedVerticalSpeedFpm: null,
      aircraft,
      flightPlan: null,
      routeStatus: null,
      guidanceTargets: {
        truth: {
          thrustActive: 'OFF',
          lateralActive: 'HDG_SEL',
          verticalActive: 'ALT_HOLD',
          autopilotStatus: 'CMD_A',
          lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
        },
        lateral: { mode: 'HDG_SEL', targetHeadingRad: 90 * Math.PI / 180 },
        vertical: { mode: 'ALT_HOLD', targetAltitudeFt: 10_000 },
        thrust: null,
      },
    } as Parameters<typeof deriveFlightDirectorCue>[0] & { guidanceTargets: unknown });

    expect(cue.roll?.mode).toBe('HDG_SEL');
    expect(cue.roll?.commandDeg).toBeCloseTo(-25.2, 1);
    expect(cue.pitch?.mode).toBe('ALT_HOLD');
    expect(cue.pitch?.commandDeg).toBeCloseTo(4, 1);
  });

  it('does not draw Flight Director command bars from unsupported shared LNAV and VS targets', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.position.alt = 9_000;
    aircraft.velocity.u = 128.6;

    const cue = deriveFlightDirectorCue({
      enabled: true,
      lateralMode: 'OFF',
      verticalMode: 'OFF',
      currentHeadingDeg: 180,
      currentRollDeg: 0,
      currentPitchDeg: 0,
      currentVerticalSpeedFpm: 0,
      altitudeFt: 9_000,
      selectedHeadingDeg: null,
      selectedAltitudeFt: null,
      selectedVerticalSpeedFpm: null,
      aircraft,
      flightPlan: null,
      routeStatus: null,
      guidanceTargets: {
        truth: {
          thrustActive: 'OFF',
          lateralActive: 'LNAV',
          verticalActive: 'VS',
          autopilotStatus: 'CMD_A',
          lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
        },
        lateral: { mode: 'LNAV', targetHeadingRad: 90 * Math.PI / 180 },
        vertical: { mode: 'VS', targetVerticalSpeedFpm: 700 },
        thrust: null,
      },
    } as Parameters<typeof deriveFlightDirectorCue>[0] & { guidanceTargets: unknown });

    expect(cue.roll).toBeNull();
    expect(cue.pitch).toBeNull();
  });

  it('shows Flight Director pitch and roll command bars when FD switches and supported AFDS modes exist', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.position.alt = 9_950;
    aircraft.velocity.w = 0;
    aircraft.attitude = { phi: 0, theta: 0, psi: 180 * Math.PI / 180 };
    aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
    const ap = apStateWithModes();
    ap.truth.lateralActive = 'HDG_SEL';
    ap.truth.verticalActive = 'ALT_HOLD';
    ap.boeing.hdgSel = true;
    ap.boeing.lnav = false;
    ap.boeing.altHold = true;
    ap.boeing.vnav = false;
    ap.boeing.heading = 210;
    ap.boeing.altitude = 10_000;
    useSimStore.setState({ aircraft });
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.getByLabelText('Flight director roll bar')).toBeTruthy();
    expect(screen.getByText('FD ROLL +8.4°')).toBeTruthy();
    expect(screen.getByLabelText('Flight director pitch bar')).toBeTruthy();
    expect(screen.getByText('FD PITCH +0.2°')).toBeTruthy();
  });

  it('does not draw Flight Director command bars for unsupported backed LNAV and VS modes', () => {
    setAircraftOnKseaRoute();
    const ap = apStateWithModes();
    ap.truth.lateralActive = 'LNAV';
    ap.truth.verticalActive = 'VS';
    ap.boeing.lnav = true;
    ap.boeing.hdgSel = false;
    ap.boeing.vs = true;
    ap.boeing.altHold = false;
    ap.boeing.verticalSpeed = 700;
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.queryByLabelText('Flight director roll bar')).toBeNull();
    expect(screen.queryByLabelText('Flight director pitch bar')).toBeNull();
  });

  it('hides the unsupported VS Flight Director pitch cue near MCP altitude capture', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.position.alt = 9_990;
    aircraft.velocity.u = 128.6;
    aircraft.velocity.w = 0;
    aircraft.attitude = { phi: 0, theta: 0, psi: 0 };
    aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
    const ap = apStateWithModes();
    ap.truth.lateralActive = 'OFF';
    ap.truth.verticalActive = 'VS';
    ap.boeing.lnav = false;
    ap.boeing.vs = true;
    ap.boeing.vnav = false;
    ap.boeing.altHold = false;
    ap.boeing.verticalSpeed = 1000;
    ap.boeing.altitude = 10_000;
    useSimStore.setState({ aircraft });
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.queryByLabelText('Flight director pitch bar')).toBeNull();
  });

  it('shows VNAV armed before TOD without drawing a pitch Flight Director command', () => {
    setAircraftBeforeTodFutureConstraint();
    const ap = apStateWithModes();
    ap.truth.lateralActive = 'LNAV';
    ap.truth.verticalActive = 'VNAV';
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
    ap.boeing.fdLeft = true;
    ap.boeing.fdRight = true;
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.getByText('VNAV')).toBeTruthy();
    expect(screen.queryByLabelText('Flight director pitch bar')).toBeNull();
  });

  it('does not draw an unsupported VNAV Flight Director pitch command for route path guidance', () => {
    setAircraftOnKseaRoute();
    const ap = apStateWithModes();
    ap.truth.lateralActive = 'LNAV';
    ap.truth.verticalActive = 'VNAV';
    ap.boeing.lnav = true;
    ap.boeing.hdgSel = false;
    ap.boeing.vnav = true;
    ap.boeing.vs = false;
    ap.boeing.altHold = false;
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.queryByLabelText('Flight director pitch bar')).toBeNull();
  });

  it('does not invent Flight Director bars before MCP/autopilot state exists', () => {
    render(<RfsPFD />);

    expect(screen.queryByLabelText('Flight director roll bar')).toBeNull();
    expect(screen.queryByLabelText('Flight director pitch bar')).toBeNull();
  });

  it('does not show Flight Director bars when both FD switches are off', () => {
    const ap = apStateWithModes();
    ap.truth.lateralActive = 'HDG_SEL';
    ap.truth.verticalActive = 'ALT_HOLD';
    ap.boeing.hdgSel = true;
    ap.boeing.altHold = true;
    ap.boeing.fdLeft = false;
    ap.boeing.fdRight = false;
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.queryByLabelText('Flight director roll bar')).toBeNull();
    expect(screen.queryByLabelText('Flight director pitch bar')).toBeNull();
  });

  it('does not invent heading or vertical-speed bugs before MCP/autopilot targets exist', () => {
    render(<RfsPFD />);

    expect(screen.queryByLabelText('Heading selected bug')).toBeNull();
    expect(screen.queryByLabelText('Vertical speed selected bug')).toBeNull();
  });

  it('does not invent speed or altitude tape bugs before MCP/autopilot targets exist', () => {
    render(<RfsPFD />);

    expect(screen.queryByLabelText('Airspeed selected bug')).toBeNull();
    expect(screen.queryByLabelText('Altitude selected bug')).toBeNull();
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

  it('labels CMD_A with PITCH OFF as lateral-only with no pitch authority on the PFD', () => {
    setAircraftOnKseaRoute();
    const ap = apStateWithModes();
    ap.truth.lateralActive = 'LNAV';
    ap.truth.verticalActive = 'OFF';
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.lnav = true;
    ap.boeing.vnav = false;
    ap.boeing.altHold = false;
    ap.boeing.vs = false;
    ap.boeing.speedMode = true;
    useSimStore.getState().setApState(ap);

    render(<RfsPFD />);

    expect(screen.getByText('CMD_A')).toBeTruthy();
    expect(screen.getByText('OFF')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Autopilot authority warning' }).textContent).toBe(
      'AP LATERAL ONLY — NO PITCH AUTHORITY',
    );
    expect(screen.queryByLabelText('Flight director pitch bar')).toBeNull();
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
