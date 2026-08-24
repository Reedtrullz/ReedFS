import { describe, expect, it } from 'vitest';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { createInitialState, B737_800_SPEC } from '../../types';
import { createRunwayToRunwayFlightWithRunways } from '../../flightPlanLoader';
import { createAircraftStateForRunway } from '../../scenarios';
import { computeRouteStatus, createNoRouteStatus } from '../navigation';
import {
  deriveEffectiveAutoflightTruth,
  effectiveAutopilotIsEngaged,
  hasSyntheticApproachAutolandCapability,
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

function aircraftAtRoute(altitudeFt = 5000) {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = 47.45;
  aircraft.position.lon = -122.31;
  aircraft.position.alt = altitudeFt;
  aircraft.velocity.u = 128.6;
  return aircraft;
}

function envaEngmSyntheticAutolandRoute(): FlightPlan {
  return {
    origin: 'ENVA',
    destination: 'ENGM',
    flightNumber: 'RFS190',
    route: 'ENVA ENGM19R_IF ENGM19R_FAF ENGM19R_RWY',
    waypoints: [
      { ident: 'ENVA', lat: 63.4583, lon: 10.9101, coordinateSource: 'synthetic', discontinuity: false },
      {
        ident: 'ENGM19R_IF',
        lat: 60.395,
        lon: 11.0,
        coordinateSource: 'synthetic',
        discontinuity: false,
        legType: 'IF',
        altitudeConstraint: { type: 'AT', altitude: 3000 },
        speedConstraint: { type: 'AT_OR_BELOW', speed: 210 },
      },
      {
        ident: 'ENGM19R_FAF',
        lat: 60.278,
        lon: 11.055,
        coordinateSource: 'synthetic',
        discontinuity: false,
        legType: 'TF',
        altitudeConstraint: { type: 'AT', altitude: 2200 },
        speedConstraint: { type: 'AT_OR_BELOW', speed: 150 },
      },
      {
        ident: 'ENGM19R_RWY',
        lat: 60.1939,
        lon: 11.1004,
        coordinateSource: 'synthetic',
        discontinuity: false,
        legType: 'RW',
        altitudeConstraint: { type: 'AT', altitude: 681 },
        speedConstraint: { type: 'AT_OR_BELOW', speed: 138 },
      },
    ],
  };
}

function aircraftOnEngmFinal(altitudeFt = 1600, aglFt = 920) {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = 60.224;
  aircraft.position.lon = 11.084;
  aircraft.position.alt = altitudeFt;
  aircraft.velocity.u = 72;
  aircraft.ground = {
    ...aircraft.ground,
    weightOnWheels: false,
    aglFt,
    groundAltFt: 681,
    contact: 'none',
    onRunway: false,
  };
  aircraft.flightPhase = 'APPROACH';
  return aircraft;
}

function engmFinalRouteStatus() {
  return {
    ...createNoRouteStatus(envaEngmSyntheticAutolandRoute()),
    routeName: 'ENVA→ENGM',
    routeValid: true,
    routeComplete: false,
    approachHandoff: 'threshold' as const,
    lnavAvailable: true,
    lnavUnavailableReason: null,
    activeLegIndex: 2,
    activeLegCount: 3,
    fromWaypointIndex: 2,
    toWaypointIndex: 3,
    fromIdent: 'ENGM19R_FAF',
    nextWaypointIdent: 'ENGM19R_RWY',
    distanceToNextM: 2 * 1852,
    distanceToNextNm: 2,
    desiredTrackRad: 190 * Math.PI / 180,
    desiredTrackDegTrue: 190,
    crossTrackErrorM: 0,
    alongTrackM: 0,
    legLengthM: 5 * 1852,
    waypointReached: false,
    sequenced: false,
  };
}

function makeAppAutolandAp(): AutopilotState {
  const ap = makeAp();
  ap.truth.autopilotStatus = 'CMD_AB';
  ap.truth.lateralActive = 'APP';
  ap.truth.verticalActive = 'G_S';
  ap.truth.thrustActive = 'SPEED';
  ap.boeing.cmdA = true;
  ap.boeing.cmdB = true;
  ap.boeing.app = true;
  ap.boeing.lnav = false;
  ap.boeing.vnav = false;
  ap.boeing.speedMode = true;
  ap.boeing.autothrottleArm = true;
  return ap;
}

function routeStatusBeforeTod(aircraft = aircraftAtRoute(30_000), flightPlan = routeWithFutureDescentConstraint()) {
  return {
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
    distanceToNextM: 160 * 1852,
    distanceToNextNm: 160,
    desiredTrackRad: 0,
    desiredTrackDegTrue: 0,
    crossTrackErrorM: 0,
    alongTrackM: 0,
    legLengthM: 180 * 1852,
    waypointReached: false,
    sequenced: false,
  };
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

  it('suppresses unsupported lateral raw modes until LOC or approach targets exist', () => {
    for (const lateralMode of ['VOR_LOC', 'APP', 'LOC'] as const) {
      const ap = makeAp();
      ap.truth.lateralActive = lateralMode;
      ap.truth.verticalActive = 'OFF';
      ap.boeing.lnav = false;
      ap.boeing.vnav = false;
      ap.boeing.vorLoc = true;
      ap.boeing.app = true;

      const effective = deriveEffectiveAutoflightTruth(ap, { routeStatus: createNoRouteStatus() });

      expect(effective.autopilotStatus).toBe('CMD_A');
      expect(effective.lateralActive).toBe('OFF');
      expect(effective.verticalActive).toBe('OFF');
    }
  });

  it('suppresses unsupported vertical raw modes until backed pitch targets exist', () => {
    for (const verticalMode of ['LVL_CHG', 'G_S'] as const) {
      const ap = makeAp();
      ap.truth.lateralActive = 'HDG_SEL';
      ap.truth.verticalActive = verticalMode;
      ap.boeing.hdgSel = true;
      ap.boeing.lnav = false;
      ap.boeing.vnav = false;
      ap.boeing.lvlChg = true;
      ap.boeing.app = true;

      const effective = deriveEffectiveAutoflightTruth(ap, { routeStatus: createNoRouteStatus() });

      expect(effective.autopilotStatus).toBe('CMD_A');
      expect(effective.lateralActive).toBe('HDG_SEL');
      expect(effective.verticalActive).toBe('OFF');
      expect((effective as { lateralOnly?: boolean }).lateralOnly).toBe(true);
    }
  });

  it('backs APP, G_S, SPEED, and CMD_AB for an airborne synthetic ENVA to ENGM autoland route', () => {
    const aircraft = aircraftOnEngmFinal();
    const flightPlan = envaEngmSyntheticAutolandRoute();
    const routeStatus = engmFinalRouteStatus();
    const ap = makeAppAutolandAp();

    const effective = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus });

    expect(hasSyntheticApproachAutolandCapability({ aircraft, flightPlan, routeStatus })).toBe(true);
    expect(effective.autopilotStatus).toBe('CMD_AB');
    expect(effective.lateralActive).toBe('APP');
    expect(effective.verticalActive).toBe('G_S');
    expect(effective.thrustActive).toBe('SPEED');
  });

  it('keeps APP and G_S fail-closed when the route lacks recognizable synthetic approach metadata', () => {
    const aircraft = aircraftAtRoute(3000);
    aircraft.ground = { ...aircraft.ground, weightOnWheels: false, aglFt: 2500, contact: 'none', onRunway: false };
    const flightPlan = constrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);
    const ap = makeAppAutolandAp();

    const effective = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus });

    expect(hasSyntheticApproachAutolandCapability({ aircraft, flightPlan, routeStatus })).toBe(false);
    expect(effective.autopilotStatus).toBe('CMD_AB');
    expect(effective.lateralActive).toBe('OFF');
    expect(effective.verticalActive).toBe('OFF');
    expect(effective.thrustActive).toBe('SPEED');
  });

  it('backs LNAV, VNAV, and SPEED on generated runway-pair routes while keeping APP and G_S unavailable', () => {
    const { flightPlan, runways } = createRunwayToRunwayFlightWithRunways({
      originAirport: 'ENBR',
      originRunway: '17',
      destinationAirport: 'ENSB',
      destinationRunway: '09',
    });
    const aircraft = createAircraftStateForRunway(B737_800_SPEC, runways.originRunway);
    aircraft.velocity.u = 128.6;
    aircraft.ground = { ...aircraft.ground, weightOnWheels: false, aglFt: 500, contact: 'none', onRunway: false };
    aircraft.flightPhase = 'CLIMB';
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const generatedAp = makeAp();
    const generatedEffective = deriveEffectiveAutoflightTruth(generatedAp, { aircraft, flightPlan, routeStatus });

    expect(routeStatus.lnavAvailable).toBe(true);
    expect(generatedEffective.autopilotStatus).toBe('CMD_A');
    expect(generatedEffective.lateralActive).toBe('LNAV');
    expect(generatedEffective.verticalActive).toBe('VNAV_PTH');
    expect(generatedEffective.thrustActive).toBe('SPEED');

    const appAp = makeAppAutolandAp();
    const appEffective = deriveEffectiveAutoflightTruth(appAp, { aircraft, flightPlan, routeStatus });

    expect(hasSyntheticApproachAutolandCapability({ aircraft, flightPlan, routeStatus })).toBe(false);
    expect(appEffective.autopilotStatus).toBe('CMD_AB');
    expect(appEffective.lateralActive).toBe('OFF');
    expect(appEffective.verticalActive).toBe('OFF');
    expect(appEffective.thrustActive).toBe('SPEED');
  });

  it('annunciates RETARD only near touchdown on a backed synthetic autoland route', () => {
    const aircraft = aircraftOnEngmFinal(710, 29);
    const flightPlan = envaEngmSyntheticAutolandRoute();
    const routeStatus = engmFinalRouteStatus();
    const ap = makeAppAutolandAp();

    const effective = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus });

    expect(effective.autopilotStatus).toBe('CMD_AB');
    expect(effective.lateralActive).toBe('APP');
    expect(effective.verticalActive).toBe('G_S');
    expect(effective.thrustActive).toBe('RETARD');
  });

  it('keeps synthetic autoland truth backed through landing rollout so RETARD remains observable', () => {
    const aircraft = aircraftOnEngmFinal(691, 10);
    aircraft.ground = { ...aircraft.ground, weightOnWheels: true, contact: 'gear', onRunway: true };
    aircraft.flightPhase = 'ROLLOUT';
    const flightPlan = envaEngmSyntheticAutolandRoute();
    const routeStatus = engmFinalRouteStatus();
    const ap = makeAppAutolandAp();

    const effective = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus });

    expect(hasSyntheticApproachAutolandCapability({ aircraft, flightPlan, routeStatus })).toBe(true);
    expect(effective.autopilotStatus).toBe('CMD_AB');
    expect(effective.lateralActive).toBe('APP');
    expect(effective.verticalActive).toBe('G_S');
    expect(effective.thrustActive).toBe('RETARD');
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

  it('keeps pre-TOD VNAV armed out of active pitch command truth', () => {
    const aircraft = aircraftAtRoute(30_000);
    const flightPlan = routeWithFutureDescentConstraint();
    const routeStatus = routeStatusBeforeTod(aircraft, flightPlan);
    const ap = makeAp();
    ap.truth.lateralActive = 'LNAV';
    ap.truth.verticalActive = 'VNAV';
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;

    const effective = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus });

    expect(effective.autopilotStatus).toBe('CMD_A');
    expect(effective.lateralActive).toBe('LNAV');
    expect(effective.verticalActive).toBe('OFF');
    expect(effective.verticalArmed).toBe('VNAV');
    expect((effective as { lateralOnly?: boolean }).lateralOnly).toBe(true);
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
