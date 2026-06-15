import { describe, expect, it } from 'vitest';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { createInitialState, B737_800_SPEC } from '../../types';
import { computeRouteStatus, createNoRouteStatus } from '../navigation';
import {
  deriveEffectiveAutoflightTruth,
  effectiveAutopilotIsEngaged,
  offAutoflightTruth,
} from '../effectiveAutoflightTruth';

function makeAp(): AutopilotState {
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
      lastModeChangeTimestamps: { thrust: 1, lateral: 2, vertical: 3 },
      vsEntry: 700,
    },
  };
}

function constrainedRoute(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'OLM',
    flightNumber: 'TST800',
    route: 'KSEA OLM',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, altitudeConstraint: { type: 'AT', altitude: 10000 } },
    ],
  };
}

function aircraftAtRoute(altitudeFt = 5000) {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = 47.45;
  aircraft.position.lon = -122.31;
  aircraft.position.alt = altitudeFt;
  aircraft.velocity.u = 128.6;
  return aircraft;
}

describe('effective autoflight truth', () => {
  it('rejects CMD_A truth unbacked by the actual command channel', () => {
    const ap = makeAp();
    ap.boeing.cmdA = false;
    ap.boeing.autothrottleArm = false;
    ap.boeing.speedMode = false;

    const effective = deriveEffectiveAutoflightTruth(ap);

    expect(effective.autopilotStatus).toBe('OFF');
    expect(effective.thrustActive).toBe('OFF');
    expect(effective.lateralActive).toBe('OFF');
    expect(effective.verticalActive).toBe('OFF');
    expect(effective.lastModeChangeTimestamps).toEqual({ thrust: 1, lateral: 2, vertical: 3 });
    expect(effective.vsEntry).toBe(700);
    expect(effectiveAutopilotIsEngaged(ap, { routeStatus: createNoRouteStatus() })).toBe(false);
  });

  it('keeps A/T SPEED effective when the autopilot channels are OFF', () => {
    const ap = makeAp();
    ap.truth.autopilotStatus = 'OFF';
    ap.truth.lateralActive = 'OFF';
    ap.truth.verticalActive = 'OFF';
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.cmdA = false;
    ap.boeing.lnav = false;
    ap.boeing.vnav = false;
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = true;

    const effective = deriveEffectiveAutoflightTruth(ap, { routeStatus: createNoRouteStatus() });

    expect(effective.autopilotStatus).toBe('OFF');
    expect(effective.lateralActive).toBe('OFF');
    expect(effective.verticalActive).toBe('OFF');
    expect(effective.thrustActive).toBe('SPEED');
    expect(effectiveAutopilotIsEngaged(ap, { routeStatus: createNoRouteStatus() })).toBe(false);
  });

  it('keeps A/T N1 effective when the autopilot channels are OFF', () => {
    const ap = makeAp();
    ap.truth.autopilotStatus = 'OFF';
    ap.truth.lateralActive = 'OFF';
    ap.truth.verticalActive = 'OFF';
    ap.truth.thrustActive = 'N1';
    ap.boeing.cmdA = false;
    ap.boeing.lnav = false;
    ap.boeing.vnav = false;
    ap.boeing.speedMode = false;
    ap.boeing.autothrottleArm = true;
    ap.boeing.n1 = true;

    const effective = deriveEffectiveAutoflightTruth(ap, { routeStatus: createNoRouteStatus() });

    expect(effective.autopilotStatus).toBe('OFF');
    expect(effective.lateralActive).toBe('OFF');
    expect(effective.verticalActive).toBe('OFF');
    expect(effective.thrustActive).toBe('N1');
    expect(effectiveAutopilotIsEngaged(ap, { routeStatus: createNoRouteStatus() })).toBe(false);
  });

  it('labels CMD_A LNAV/SPEED with PITCH OFF as lateral-only instead of full AP control', () => {
    const aircraft = aircraftAtRoute();
    const flightPlan = constrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);
    const ap = makeAp();
    ap.truth.lateralActive = 'LNAV';
    ap.truth.verticalActive = 'OFF';
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.cmdA = true;
    ap.boeing.lnav = true;
    ap.boeing.vnav = false;
    ap.boeing.altHold = false;
    ap.boeing.vs = false;
    ap.boeing.speedMode = true;

    const effective = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus }) as ReturnType<typeof deriveEffectiveAutoflightTruth> & { lateralOnly?: boolean };

    expect(effective.autopilotStatus).toBe('CMD_A');
    expect(effective.lateralActive).toBe('LNAV');
    expect(effective.verticalActive).toBe('OFF');
    expect(effective.thrustActive).toBe('SPEED');
    expect(effective.lateralOnly).toBe(true);
  });

  it('keeps backed CMD_A while rejecting unbacked mode flags', () => {
    const ap = makeAp();
    ap.boeing.speedMode = false;
    ap.boeing.lnav = false;
    ap.boeing.vnav = false;

    const effective = deriveEffectiveAutoflightTruth(ap);

    expect(effective.autopilotStatus).toBe('CMD_A');
    expect(effective.thrustActive).toBe('OFF');
    expect(effective.lateralActive).toBe('OFF');
    expect(effective.verticalActive).toBe('OFF');
    expect(effectiveAutopilotIsEngaged(ap, { routeStatus: createNoRouteStatus() })).toBe(true);
  });

  it('derives backed LNAV, VNAV_PTH, SPEED, and CMD_A for a valid constrained route', () => {
    const aircraft = aircraftAtRoute();
    const flightPlan = constrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const effective = deriveEffectiveAutoflightTruth(makeAp(), { aircraft, flightPlan, routeStatus });

    expect(effective.autopilotStatus).toBe('CMD_A');
    expect(effective.thrustActive).toBe('SPEED');
    expect(effective.lateralActive).toBe('LNAV');
    expect(effective.verticalActive).toBe('VNAV_PTH');
  });

  it('derives ALT* near the active VNAV altitude constraint', () => {
    const aircraft = aircraftAtRoute(9800);
    const flightPlan = constrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const effective = deriveEffectiveAutoflightTruth(makeAp(), { aircraft, flightPlan, routeStatus });

    expect(effective.verticalActive).toBe('ALT*');
  });

  it('exports an OFF truth helper that preserves mode metadata', () => {
    const off = offAutoflightTruth(makeAp());

    expect(off.autopilotStatus).toBe('OFF');
    expect(off.thrustActive).toBe('OFF');
    expect(off.lateralActive).toBe('OFF');
    expect(off.verticalActive).toBe('OFF');
    expect(off.lastModeChangeTimestamps).toEqual({ thrust: 1, lateral: 2, vertical: 3 });
    expect(off.vsEntry).toBe(700);
  });
});
