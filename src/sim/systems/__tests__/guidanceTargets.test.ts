import { describe, expect, it } from 'vitest';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { createInitialState, B737_800_SPEC } from '../../types';
import { computeRouteStatus, createNoRouteStatus, routeStatusToNavOutput } from '../navigation';
import { computeVNAV } from '../vnav';
import { resolveAutopilotTargets } from '../autopilot';
import {
  hasFlightDirectorGuidanceTarget,
  resolveFlightDirectorGuidanceTargets,
  resolveGuidanceTargets,
} from '../guidanceTargets';

function apState(): AutopilotState {
  return {
    boeing: {
      courseL: 0,
      courseR: 0,
      speed: null,
      mach: null,
      heading: 180,
      altitude: 5000,
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
      altitude: 5000,
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

function routeWithVnavPathConstraint(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'TST230',
    route: 'KSEA OLM',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, altitudeConstraint: { type: 'AT', altitude: 10000 }, speedConstraint: { type: 'AT_OR_BELOW', speed: 220 } },
    ],
  };
}

function aircraftAtRoute() {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = 47.45;
  aircraft.position.lon = -122.31;
  aircraft.position.alt = 5000;
  aircraft.velocity.u = 128.6;
  aircraft.ground = { ...aircraft.ground, weightOnWheels: false, aglFt: 3000, contact: 'none', onRunway: false };
  return aircraft;
}

describe('resolveGuidanceTargets', () => {
  it('produces the same backed target values consumed by the AP target resolver', () => {
    const aircraft = aircraftAtRoute();
    const ap = apState();
    const flightPlan = routeWithVnavPathConstraint();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);
    const nav = routeStatusToNavOutput(routeStatus, { maxInterceptDeg: 25 });
    expect(nav).not.toBeNull();
    const vnav = computeVNAV(aircraft, flightPlan, nav!);

    const shared = resolveGuidanceTargets({ aircraft, apState: ap, flightPlan, routeStatus });
    const legacy = resolveAutopilotTargets(aircraft, { ...ap, truth: shared.truth }, flightPlan, 0, routeStatus);

    expect(shared.truth.lateralActive).toBe('LNAV');
    expect(shared.truth.verticalActive).toBe('VNAV_PTH');
    expect(shared.lateral?.mode).toBe('LNAV');
    expect(shared.lateral?.targetHeadingRad).toBeCloseTo(legacy.targetHeadingRad, 10);
    expect(shared.vertical?.mode).toBe('VNAV_PTH');
    expect(shared.vertical?.targetAltitudeFt).toBe(legacy.targetAltFt);
    expect(shared.vertical?.targetVerticalSpeedFpm).toBe(vnav.targetVs);
    expect(shared.thrust?.mode).toBe('SPEED');
    expect(shared.thrust?.targetSpeedKt).toBe(220);
    expect(shared.thrust?.targetSpeedKt).toBe(legacy.targetSpeedKt);
  });

  it('does not clamp an out-of-range active leg into a valid AP/FD route target without a route-status override', () => {
    const aircraft = aircraftAtRoute();
    const ap = apState();
    const flightPlan = routeWithVnavPathConstraint();

    const shared = resolveGuidanceTargets({
      aircraft,
      apState: ap,
      flightPlan,
      activeLegIndex: 999,
      truthOverride: ap.truth,
    });

    expect(shared.truth.lateralActive).toBe('LNAV');
    expect(shared.truth.verticalActive).toBe('VNAV');
    expect(shared.lateral).toBeNull();
    expect(shared.vertical).toBeNull();
    expect(shared.thrust?.targetSpeedKt).toBe(250);
  });

  it('does not expose AP or FD roll/pitch targets when raw modes are not backed', () => {
    const aircraft = aircraftAtRoute();
    const ap = apState();
    ap.boeing.cmdA = false;
    ap.boeing.lnav = false;
    ap.boeing.vnav = false;
    ap.boeing.speedMode = false;
    const flightPlan = routeWithVnavPathConstraint();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const shared = resolveGuidanceTargets({ aircraft, apState: ap, flightPlan, routeStatus });

    expect(shared.truth.autopilotStatus).toBe('OFF');
    expect(shared.truth.lateralActive).toBe('OFF');
    expect(shared.truth.verticalActive).toBe('OFF');
    expect(shared.truth.thrustActive).toBe('OFF');
    expect(shared.lateral).toBeNull();
    expect(shared.vertical).toBeNull();
    expect(shared.thrust).toBeNull();
  });

  it('keeps lateral-only CMD_A from exposing any vertical AP target', () => {
    const aircraft = aircraftAtRoute();
    const ap = apState();
    ap.truth.lateralActive = 'LNAV';
    ap.truth.verticalActive = 'OFF';
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.lnav = true;
    ap.boeing.vnav = false;
    ap.boeing.altHold = false;
    ap.boeing.vs = false;
    ap.boeing.speedMode = true;
    const flightPlan = routeWithVnavPathConstraint();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const shared = resolveGuidanceTargets({ aircraft, apState: ap, flightPlan, routeStatus });

    expect(shared.truth.autopilotStatus).toBe('CMD_A');
    expect(shared.truth.lateralActive).toBe('LNAV');
    expect(shared.truth.verticalActive).toBe('OFF');
    expect(shared.lateral?.mode).toBe('LNAV');
    expect(shared.thrust?.mode).toBe('SPEED');
    expect(shared.vertical).toBeNull();
  });

  it('exposes selected-altitude ALT* capture targets before ALT_HOLD is stabilized', () => {
    const aircraft = aircraftAtRoute();
    aircraft.position.alt = 9_650;
    aircraft.velocity.w = 12;
    const ap = apState();
    ap.truth.verticalActive = 'ALT_HOLD';
    ap.boeing.vnav = false;
    ap.boeing.altHold = true;
    ap.boeing.altitude = 10_000;

    const shared = resolveGuidanceTargets({ aircraft, apState: ap, flightPlan: null, routeStatus: createNoRouteStatus() });

    expect(shared.truth.verticalActive).toBe('ALT*');
    expect(shared.vertical?.mode).toBe('ALT*');
    expect(shared.vertical?.targetAltitudeFt).toBe(10_000);
    expect(shared.vertical?.targetVerticalSpeedFpm).toBeGreaterThan(0);
  });

  it('filters shared guidance down to finite supported Flight Director targets', () => {
    const sharedTargets = {
      truth: {
        thrustActive: 'OFF' as const,
        lateralActive: 'HDG_SEL' as const,
        verticalActive: 'ALT_HOLD' as const,
        autopilotStatus: 'CMD_A' as const,
        lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
      },
      lateral: { mode: 'HDG_SEL' as const, targetHeadingRad: Math.PI / 2 },
      vertical: { mode: 'ALT_HOLD' as const, targetAltitudeFt: 12_000 },
      thrust: null,
    };

    const shared = resolveFlightDirectorGuidanceTargets(sharedTargets);

    expect(shared.lateral).toEqual({ mode: 'HDG_SEL', targetHeadingRad: Math.PI / 2 });
    expect(shared.vertical).toEqual({ mode: 'ALT_HOLD', targetAltitudeFt: 12_000 });
    expect(hasFlightDirectorGuidanceTarget(sharedTargets)).toBe(true);
  });

  it('does not expose malformed or unsupported Flight Director targets as command guidance', () => {
    const unsupportedTargets = {
      truth: {
        thrustActive: 'OFF' as const,
        lateralActive: 'LNAV' as const,
        verticalActive: 'VS' as const,
        autopilotStatus: 'CMD_A' as const,
        lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
      },
      lateral: { mode: 'LNAV' as const, targetHeadingRad: Number.NaN },
      vertical: { mode: 'ALT_HOLD' as const },
      thrust: null,
    };

    const malformed = resolveFlightDirectorGuidanceTargets(unsupportedTargets);

    expect(malformed.lateral).toBeNull();
    expect(malformed.vertical).toBeNull();
    expect(hasFlightDirectorGuidanceTarget(unsupportedTargets)).toBe(false);
  });
});
