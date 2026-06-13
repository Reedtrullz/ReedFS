import { describe, expect, it } from 'vitest';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { createInitialState, B737_800_SPEC } from '../../types';
import { createNoRouteStatus, computeRouteStatus, type RouteStatusSnapshot } from '../navigation';
import { deriveDisplayFmaTruth } from '../fmaTruth';

function apState(): AutopilotState {
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

function constrainedRoute(): FlightPlan {
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

function unconstrainedRoute(): FlightPlan {
  return {
    ...constrainedRoute(),
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false },
    ],
  };
}

function aircraftAtRoute() {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = 47.45;
  aircraft.position.lon = -122.31;
  aircraft.position.alt = 5000;
  aircraft.velocity.u = 128.6;
  return aircraft;
}

describe('deriveDisplayFmaTruth', () => {
  it('does not display raw LNAV or VNAV when route guidance is unavailable', () => {
    const raw = apState();
    const fma = deriveDisplayFmaTruth(raw, {
      aircraft: aircraftAtRoute(),
      flightPlan: null,
      routeStatus: createNoRouteStatus(),
    });

    expect(fma.autopilotStatus).toBe('CMD_A');
    expect(fma.lateralActive).toBe('OFF');
    expect(fma.verticalActive).toBe('OFF');
    expect(fma.thrustActive).toBe('SPEED');
  });

  it('uses the current VNAV lifecycle mode when VNAV is active and constraints are available', () => {
    const aircraft = aircraftAtRoute();
    const flightPlan = constrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const fma = deriveDisplayFmaTruth(apState(), { aircraft, flightPlan, routeStatus });

    expect(fma.lateralActive).toBe('LNAV');
    expect(fma.verticalActive).toBe('VNAV_PTH');
  });

  it('uses route-status distance fallback when along-track distance is unavailable', () => {
    const aircraft = aircraftAtRoute();
    const flightPlan = constrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);
    const fallbackOnlyRouteStatus = {
      ...routeStatus,
      alongTrackM: null,
      distanceToNextM: 18_520,
    };

    const fma = deriveDisplayFmaTruth(apState(), {
      aircraft,
      flightPlan,
      routeStatus: fallbackOnlyRouteStatus,
    });

    expect(fma.verticalActive).toBe('VNAV_PTH');
  });

  it('shows ALT_HOLD at VNAV managed capture while preserving the managed constraint source', () => {
    const aircraft = aircraftAtRoute();
    aircraft.position.alt = 10020;
    const raw = apState();
    raw.boeing.altitude = 30000;
    const flightPlan = constrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const fma = deriveDisplayFmaTruth(raw, { aircraft, flightPlan, routeStatus }) as ReturnType<typeof deriveDisplayFmaTruth> & {
      targetAltitudeSource?: string;
      captureTargetAltFt?: number;
    };

    expect(fma.verticalActive).toBe('ALT_HOLD');
    expect(fma.targetAltitudeSource).toBe('VNAV_CONSTRAINT');
    expect(fma.captureTargetAltFt).toBe(10000);
  });

  it('downgrades VNAV-family truth when the active waypoint has no actionable VNAV constraint', () => {
    const aircraft = aircraftAtRoute();
    const flightPlan = unconstrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const fma = deriveDisplayFmaTruth(apState(), { aircraft, flightPlan, routeStatus });

    expect(fma.lateralActive).toBe('LNAV');
    expect(fma.verticalActive).toBe('OFF');
  });

  it('does not display SPEED or N1 unless autothrottle owns that thrust mode', () => {
    const raw = apState();
    raw.boeing.speedMode = false;
    let fma = deriveDisplayFmaTruth(raw, { routeStatus: createNoRouteStatus() });
    expect(fma.thrustActive).toBe('OFF');

    raw.truth.thrustActive = 'N1';
    raw.boeing.n1 = true;
    raw.boeing.autothrottleArm = false;
    fma = deriveDisplayFmaTruth(raw, { routeStatus: createNoRouteStatus() });
    expect(fma.thrustActive).toBe('OFF');
  });

  it('downgrades unsupported raw modes instead of displaying unflown guidance', () => {
    const raw = apState();
    raw.truth.thrustActive = 'THR_CLB';
    raw.truth.lateralActive = 'NAV';
    raw.truth.verticalActive = 'CLB';

    const fma = deriveDisplayFmaTruth(raw, { routeStatus: createNoRouteStatus() });

    expect(fma.thrustActive).toBe('OFF');
    expect(fma.lateralActive).toBe('OFF');
    expect(fma.verticalActive).toBe('OFF');
  });

  it('shows backed A/T SPEED while raw CMD status falls back to OFF when no AP channel is engaged', () => {
    const raw = apState();
    raw.boeing.cmdA = false;
    const routeStatus: RouteStatusSnapshot = createNoRouteStatus();

    const fma = deriveDisplayFmaTruth(raw, { routeStatus });

    expect(fma.autopilotStatus).toBe('OFF');
    expect(fma.thrustActive).toBe('SPEED');
    expect(fma.lateralActive).toBe('OFF');
    expect(fma.verticalActive).toBe('OFF');
  });

  it('falls fully back to OFF when raw CMD and A/T statuses are both unbacked', () => {
    const raw = apState();
    raw.boeing.cmdA = false;
    raw.boeing.autothrottleArm = false;
    raw.boeing.speedMode = false;
    const routeStatus: RouteStatusSnapshot = createNoRouteStatus();

    const fma = deriveDisplayFmaTruth(raw, { routeStatus });

    expect(fma.autopilotStatus).toBe('OFF');
    expect(fma.thrustActive).toBe('OFF');
    expect(fma.lateralActive).toBe('OFF');
    expect(fma.verticalActive).toBe('OFF');
  });
});
