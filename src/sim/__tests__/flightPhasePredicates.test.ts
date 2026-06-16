import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, createInitialState } from '../types';
import { createNoRouteStatus, type RouteStatusSnapshot } from '../systems/navigation';
import { deriveRouteDrivenFlightPhase, isPositiveRateEstablished } from '../flightPhasePredicates';
import { eulerToQuat } from '../physics/quaternion';

function lifecycleRouteStatus(overrides: Partial<RouteStatusSnapshot> = {}): RouteStatusSnapshot {
  return {
    ...createNoRouteStatus(),
    routeName: 'KSEA→KPDX',
    routeValid: true,
    routeComplete: false,
    approachHandoff: 'none',
    lnavAvailable: true,
    lnavUnavailableReason: null,
    activeLegIndex: 3,
    activeLegCount: 5,
    fromWaypointIndex: 3,
    toWaypointIndex: 4,
    fromIdent: 'KPDX10R_IF',
    nextWaypointIdent: 'KPDX10R_FAF',
    distanceToNextM: 12_000,
    distanceToNextNm: 6.5,
    desiredTrackRad: 1.75,
    desiredTrackDegTrue: 100,
    crossTrackErrorM: 0,
    alongTrackM: 0,
    legLengthM: 12_000,
    waypointReached: false,
    sequenced: false,
    ...overrides,
  };
}

function airborneCruiseState() {
  const state = createInitialState(B737_800_SPEC);
  state.flightPhase = 'CRUISE';
  state.position.alt = 10_000;
  state.ground = {
    ...state.ground,
    weightOnWheels: false,
    contact: 'none',
    onRunway: false,
    aglFt: 9_900,
    groundAltFt: 100,
  };
  state.config.gearDown = false;
  state.config.gearPosition = 0;
  state.velocity.u = 130;
  state.velocity.w = 0;
  return state;
}

describe('isPositiveRateEstablished', () => {
  it('is false when airborne but descending above the runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = 2;

    expect(isPositiveRateEstablished(state)).toBe(false);
  });

  it('is true only after gear is unloaded and vertical speed is upward', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = -1.5;

    expect(isPositiveRateEstablished(state)).toBe(true);
  });

  it('is true when pitched climb creates upward NED vertical speed with zero body w', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.u = 75;
    state.velocity.w = 0;
    state.attitude.theta = 5 * Math.PI / 180;
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);

    expect(isPositiveRateEstablished(state)).toBe(true);
  });

  it('is false at the upward NED vertical speed boundary', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.ground.aglFt = 80;
    state.velocity.w = -0.25;

    expect(isPositiveRateEstablished(state)).toBe(false);
  });

  it('is false when still weight-on-wheels even with upward body w', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = true;
    state.ground.aglFt = 80;
    state.velocity.w = -1.5;

    expect(isPositiveRateEstablished(state)).toBe(false);
  });

  it('is false when airborne but AGL is not above the minimum threshold', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground.weightOnWheels = false;
    state.velocity.w = -1.5;

    state.ground.aglFt = 10;
    expect(isPositiveRateEstablished(state)).toBe(false);

    state.ground.aglFt = 0;
    expect(isPositiveRateEstablished(state)).toBe(false);
  });
});

describe('deriveRouteDrivenFlightPhase', () => {
  it('starts DESCENT from CRUISE when an upcoming route altitude target requires descent', () => {
    const state = airborneCruiseState();

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: lifecycleRouteStatus({ approachHandoff: 'final' }),
      descentTargetAltitudeFt: 1_550,
    })).toBe('DESCENT');
  });

  it('starts DESCENT from CLIMB when selected VS commands descent inside the route window', () => {
    const state = airborneCruiseState();
    state.flightPhase = 'CLIMB';
    state.position.alt = 2_400;
    state.ground.aglFt = 2_300;

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: lifecycleRouteStatus({
        approachHandoff: 'none',
        activeLegIndex: 1,
        activeLegCount: 5,
        distanceToNextNm: 44,
        distanceToNextM: 44 * 1852,
      }),
      descentTargetAltitudeFt: null,
      selectedVerticalSpeedFpm: -1500,
    })).toBe('DESCENT');
  });

  it('does not start DESCENT hundreds of miles early just because the route has few remaining legs', () => {
    const state = airborneCruiseState();

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: lifecycleRouteStatus({
        approachHandoff: 'none',
        activeLegIndex: 3,
        activeLegCount: 5,
        distanceToNextNm: 240,
        distanceToNextM: 240 * 1852,
      }),
      descentTargetAltitudeFt: 1_550,
    })).toBe('CRUISE');
  });

  it('does not auto-seed APPROACH directly from CRUISE even on a final route segment', () => {
    const state = airborneCruiseState();
    state.config.gearDown = true;
    state.config.gearPosition = 1;
    state.config.flapSetting = 30;

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: lifecycleRouteStatus({ approachHandoff: 'final' }),
      descentTargetAltitudeFt: 1_550,
    })).toBe('DESCENT');
  });

  it('moves from DESCENT to APPROACH only when near final and configured for landing', () => {
    const state = airborneCruiseState();
    state.flightPhase = 'DESCENT';
    state.ground.aglFt = 2_400;
    state.config.gearDown = true;
    state.config.gearPosition = 1;
    state.config.flapSetting = 30;

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: lifecycleRouteStatus({ approachHandoff: 'final' }),
      descentTargetAltitudeFt: 1_550,
    })).toBe('APPROACH');
  });

  it('keeps DESCENT instead of calling APPROACH when final is not configured', () => {
    const state = airborneCruiseState();
    state.flightPhase = 'DESCENT';
    state.ground.aglFt = 2_400;
    state.config.gearDown = false;
    state.config.gearPosition = 0;
    state.config.flapSetting = 5;

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: lifecycleRouteStatus({ approachHandoff: 'final' }),
      descentTargetAltitudeFt: 1_550,
    })).toBe('DESCENT');
  });

  it('keeps a route-guided configured descent in DESCENT until final or threshold handoff', () => {
    const state = airborneCruiseState();
    state.flightPhase = 'DESCENT';
    state.ground.aglFt = 301;
    state.config.gearDown = true;
    state.config.gearPosition = 1;
    state.config.flapSetting = 30;

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: lifecycleRouteStatus({
        approachHandoff: 'none',
        activeLegIndex: 1,
        activeLegCount: 5,
        distanceToNextNm: 18,
        distanceToNextM: 18 * 1852,
      }),
      descentTargetAltitudeFt: 1_550,
    })).toBe('DESCENT');
  });

  it('keeps route-less seeded DESCENT in descent while gear and landing flaps are not configured', () => {
    const state = airborneCruiseState();
    state.flightPhase = 'DESCENT';
    state.ground.aglFt = 301;
    state.config.gearDown = false;
    state.config.gearPosition = 0;
    state.config.flapSetting = 5;

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: createNoRouteStatus(),
      descentTargetAltitudeFt: null,
    })).toBe('DESCENT');
  });

  it('moves a route-less seeded DESCENT into APPROACH only after landing configuration is established', () => {
    const state = airborneCruiseState();
    state.flightPhase = 'DESCENT';
    state.ground.aglFt = 301;
    state.config.gearDown = true;
    state.config.gearPosition = 1;
    state.config.flapSetting = 30;

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: createNoRouteStatus(),
      descentTargetAltitudeFt: null,
    })).toBe('APPROACH');
  });
});
