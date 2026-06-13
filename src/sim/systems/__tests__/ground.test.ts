import { describe, expect, it } from 'vitest';
import { createInitialState, B737_800_SPEC, createB737GearStations } from '../../types';
import type { ControlInputs } from '../../types';
import {
  applyGroundContact,
  computeGroundRollForces,
  computeNosewheelSteeringAngleRad,
  computeOleoStrutLoads,
  computeTireSideForces,
  computeWheelBrakeForces,
  ENVA_RUNWAY_ALT_FT,
  KSEA_RUNWAY_ALT_FT,
} from '../ground';
import { B737_800_FDM } from '../../data/aircraft/b737-800-fdm.v1';
import { bodyToNed, nedToBody } from '../../physics/frames';
import { eulerToQuat } from '../../physics/quaternion';
import { KSEA_RUNWAY_16L } from '../../../viewport/runwayData';
import { sampleKseaSurface, sampleSupportedAirportSurface } from '../../runwaySurface';
import { ktToMs } from '../../physics/units';

const DEG_TO_RAD = Math.PI / 180;

const idle: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0,
  throttle2: 0,
  flapLever: 0,
  gearLever: 'DOWN',
  spoilers: 0,
  brake: 0,
};

function offsetPositionMeters(
  position: { lat: number; lon: number; altFt?: number; alt?: number },
  northM: number,
  eastM: number,
): { lat: number; lon: number; alt: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(position.lat * Math.PI / 180);
  return {
    lat: position.lat + northM / metersPerDegreeLat,
    lon: position.lon + eastM / metersPerDegreeLon,
    alt: position.alt ?? position.altFt ?? KSEA_RUNWAY_ALT_FT,
  };
}

describe('applyGroundContact', () => {
  it('initial state starts on the runway with explicit gear contact state', () => {
    const state = createInitialState(B737_800_SPEC);

    expect(state.ground.weightOnWheels).toBe(true);
    expect(state.ground.aglFt).toBe(0);
    expect(state.ground.groundAltFt).toBe(ENVA_RUNWAY_ALT_FT);
    expect(state.ground.contact).toBe('gear');
    expect(state.ground.onRunway).toBe(true);
    expect(state.ground.normalForceN).toBeGreaterThan(0);
  });

  it('treats commanded-down but actually retracted gear as gear-up runway contact', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position = { lat: KSEA_RUNWAY_16L.start.lat, lon: KSEA_RUNWAY_16L.start.lon, alt: KSEA_RUNWAY_ALT_FT };
    state.config.gearDown = false;
    state.config.gearPosition = 0;
    state.velocity.w = 1.5;
    state.ground = {
      ...state.ground,
      weightOnWheels: false,
      normalForceN: 0,
      contact: 'none',
      gearStations: createB737GearStations(0, false),
    };

    const contact = applyGroundContact(state, { ...idle, gearLever: 'DOWN' }, 1 / 60, KSEA_RUNWAY_ALT_FT);

    expect(contact.contact).toBe('belly');
    expect(contact.weightOnWheels).toBe(false);
    expect(contact.gearStations.every((station) => !station.weightOnWheel && station.normalForceN === 0)).toBe(true);
    expect(state.config.gearDown).toBe(false);
  });

  it('initial state defines nose and left/right main gear stations in body axes', () => {
    const state = createInitialState(B737_800_SPEC);

    expect(state.ground.gearStations.map((station) => station.id)).toEqual(['nose', 'leftMain', 'rightMain']);
    const nose = state.ground.gearStations[0];
    const leftMain = state.ground.gearStations[1];
    const rightMain = state.ground.gearStations[2];

    expect(nose.positionBodyM.x).toBeGreaterThan(0);
    expect(nose.positionBodyM.y).toBe(0);
    expect(nose.steerable).toBe(true);
    expect(nose.brakeCapable).toBe(false);
    expect(leftMain.positionBodyM.x).toBeLessThan(0);
    expect(leftMain.positionBodyM.y).toBeLessThan(0);
    expect(rightMain.positionBodyM.x).toBe(leftMain.positionBodyM.x);
    expect(rightMain.positionBodyM.y).toBeCloseTo(-leftMain.positionBodyM.y, 8);
    expect(leftMain.brakeCapable).toBe(true);
    expect(rightMain.brakeCapable).toBe(true);
    expect(state.ground.gearStations.every((station) => station.positionBodyM.z > 0)).toBe(true);
  });

  it('distributes gear normal force across gear stations while on wheels', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.config.gearDown = true;

    const contact = applyGroundContact(state, idle, 1 / 60, KSEA_RUNWAY_ALT_FT, { normalForceN: 120_000 });

    expect(contact.gearStations).toHaveLength(3);
    expect(contact.gearStations.every((station) => station.weightOnWheel)).toBe(true);
    expect(contact.gearStations.map((station) => station.normalForceN)).toEqual([12_000, 54_000, 54_000]);
    expect(contact.gearStations.reduce((sum, station) => sum + station.normalForceN, 0)).toBeCloseTo(120_000, 6);
  });

  it('keeps nose gear loaded and clamps pitch below VR with neutral elevator', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = ktToMs(89);
    state.attitude.theta = 6.7 * DEG_TO_RAD;
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
    state.config.gearDown = true;

    const contact = applyGroundContact(state, idle, 1 / 60, KSEA_RUNWAY_ALT_FT);
    const nose = contact.gearStations.find((station) => station.id === 'nose');

    expect(state.attitude.theta).toBeLessThanOrEqual(3 * DEG_TO_RAD);
    expect(nose?.weightOnWheel).toBe(true);
    expect(nose?.normalForceN ?? 0).toBeGreaterThan(0);
    expect(contact).toEqual(expect.objectContaining({ tailstrike: false }));
  });

  it('permits main-gear pivot after VR with elevator intent and unloads the nose gear', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = ktToMs(150);
    state.attitude.theta = 8 * DEG_TO_RAD;
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
    state.config.gearDown = true;

    const contact = applyGroundContact(state, { ...idle, elevator: -1 }, 1 / 60, KSEA_RUNWAY_ALT_FT);
    const nose = contact.gearStations.find((station) => station.id === 'nose');
    const mains = contact.gearStations.filter((station) => station.id === 'leftMain' || station.id === 'rightMain');

    expect(state.attitude.theta).toBeGreaterThanOrEqual(7.5 * DEG_TO_RAD);
    expect(nose?.normalForceN ?? 0).toBeLessThan(contact.normalForceN * 0.03);
    expect(mains.every((station) => station.weightOnWheel && station.normalForceN > 0)).toBe(true);
    expect(contact).toEqual(expect.objectContaining({ tailstrike: false }));
  });

  it('touches main gear before the nose during a flare with the fuselage reference still above the runway plane', () => {
    const state = createInitialState(B737_800_SPEC);
    const headingRad = KSEA_RUNWAY_16L.headingDeg * DEG_TO_RAD;
    state.position = offsetPositionMeters(
      KSEA_RUNWAY_16L.start,
      Math.cos(headingRad) * 600,
      Math.sin(headingRad) * 600,
    );
    state.position.alt = KSEA_RUNWAY_ALT_FT + 3.2;
    state.attitude = { ...state.attitude, phi: 0, theta: 8 * DEG_TO_RAD, psi: headingRad };
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
    state.ground = {
      ...state.ground,
      weightOnWheels: false,
      normalForceN: 0,
      contact: 'none',
      gearStations: createB737GearStations(0, false),
    };
    state.config.gearDown = true;
    const surface = sampleSupportedAirportSurface(state.position);

    const contact = applyGroundContact(state, { ...idle, elevator: -1 }, 1 / 60, KSEA_RUNWAY_ALT_FT, { surface });
    const nose = contact.gearStations.find((station) => station.id === 'nose');
    const mains = contact.gearStations.filter((station) => station.id === 'leftMain' || station.id === 'rightMain');

    expect(surface.onRunway).toBe(true);
    expect(contact.contact).toBe('gear');
    expect(contact.weightOnWheels).toBe(true);
    expect(state.position.alt).toBeGreaterThan(KSEA_RUNWAY_ALT_FT + 1);
    expect(nose?.weightOnWheel).toBe(false);
    expect(nose?.normalForceN ?? 0).toBe(0);
    expect(mains).toHaveLength(2);
    expect(mains.every((station) => station.weightOnWheel && station.normalForceN > 0)).toBe(true);
  });

  it('uses air-relative rotation reference speed instead of fixed ground speed for pivot gating', () => {
    const heavyLike = createInitialState(B737_800_SPEC);
    heavyLike.position.alt = KSEA_RUNWAY_ALT_FT;
    heavyLike.velocity.u = ktToMs(150);
    heavyLike.attitude.theta = 8 * DEG_TO_RAD;
    heavyLike.quaternion = eulerToQuat(heavyLike.attitude.phi, heavyLike.attitude.theta, heavyLike.attitude.psi);
    heavyLike.config.gearDown = true;

    const blocked = applyGroundContact(
      heavyLike,
      { ...idle, elevator: -1 },
      1 / 60,
      KSEA_RUNWAY_ALT_FT,
      { airRelativeSpeedMps: ktToMs(150), rotationReferenceSpeedMps: ktToMs(170) },
    );
    const blockedNose = blocked.gearStations.find((station) => station.id === 'nose');

    expect(heavyLike.attitude.theta).toBeLessThanOrEqual(3 * DEG_TO_RAD);
    expect(blockedNose?.normalForceN ?? 0).toBeGreaterThan(0);

    const headwindLike = createInitialState(B737_800_SPEC);
    headwindLike.position.alt = KSEA_RUNWAY_ALT_FT;
    headwindLike.velocity.u = ktToMs(110);
    headwindLike.attitude.theta = 8 * DEG_TO_RAD;
    headwindLike.quaternion = eulerToQuat(headwindLike.attitude.phi, headwindLike.attitude.theta, headwindLike.attitude.psi);
    headwindLike.config.gearDown = true;

    const pivot = applyGroundContact(
      headwindLike,
      { ...idle, elevator: -1 },
      1 / 60,
      KSEA_RUNWAY_ALT_FT,
      { airRelativeSpeedMps: ktToMs(150), rotationReferenceSpeedMps: ktToMs(149) },
    );
    const pivotNose = pivot.gearStations.find((station) => station.id === 'nose');

    expect(headwindLike.attitude.theta).toBeGreaterThanOrEqual(7.5 * DEG_TO_RAD);
    expect(pivotNose?.normalForceN ?? 0).toBeLessThan(pivot.normalForceN * 0.03);
  });

  it('flags tailstrike explicitly instead of treating high-pitch ground contact as normal VR rotation', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = ktToMs(150);
    state.attitude.theta = 15 * DEG_TO_RAD;
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
    state.config.gearDown = true;

    const contact = applyGroundContact(state, { ...idle, elevator: -1 }, 1 / 60, KSEA_RUNWAY_ALT_FT);

    expect(contact.contact).toBe('gear');
    expect(contact).toEqual(expect.objectContaining({ tailstrike: true }));
    expect(state.attitude.theta).toBeLessThanOrEqual(12.5 * DEG_TO_RAD);
  });

  it('computes oleo spring load from runway penetration', () => {
    const baseStations = createB737GearStations(100_000, true);

    const loads = computeOleoStrutLoads(baseStations, {
      totalStaticNormalForceN: 100_000,
      groundPenetrationM: 0.1,
      runwayDownMps: 0,
    });

    const baseLeftMain = baseStations.find((station) => station.id === 'leftMain');
    const loadedLeftMain = loads.gearStations.find((station) => station.id === 'leftMain');
    expect(loadedLeftMain?.compressionM).toBeGreaterThan(baseLeftMain?.compressionM ?? 0);
    expect(loadedLeftMain?.normalForceN).toBeGreaterThan(baseLeftMain?.normalForceN ?? 0);
    expect(loads.springForceN).toBeGreaterThan(100_000);
    expect(loads.dampingForceN).toBe(0);
    expect(loads.totalNormalForceN).toBeCloseTo(
      loads.gearStations.reduce((sum, station) => sum + station.normalForceN, 0),
      8,
    );
  });

  it('computes oleo damping for touchdown sink rate but not rebound', () => {
    const baseStations = createB737GearStations(100_000, true);

    const settled = computeOleoStrutLoads(baseStations, {
      totalStaticNormalForceN: 100_000,
      groundPenetrationM: 0,
      runwayDownMps: 0,
    });
    const touchdown = computeOleoStrutLoads(baseStations, {
      totalStaticNormalForceN: 100_000,
      groundPenetrationM: 0,
      runwayDownMps: 3,
    });
    const rebound = computeOleoStrutLoads(baseStations, {
      totalStaticNormalForceN: 100_000,
      groundPenetrationM: 0,
      runwayDownMps: -3,
    });

    expect(touchdown.dampingForceN).toBeGreaterThan(0);
    expect(touchdown.totalNormalForceN).toBeGreaterThan(settled.totalNormalForceN);
    expect(rebound.dampingForceN).toBe(0);
    expect(rebound.totalNormalForceN).toBeCloseTo(settled.totalNormalForceN, 8);
  });

  it('computes oleo penetration and damping loads when residual static normal is zero', () => {
    const unloadedButContacting = createB737GearStations(0, true);

    const loads = computeOleoStrutLoads(unloadedButContacting, {
      totalStaticNormalForceN: 0,
      referenceWeightN: 100_000,
      groundPenetrationM: 0.1,
      runwayDownMps: 3,
    });

    expect(loads.springForceN).toBeGreaterThan(0);
    expect(loads.dampingForceN).toBeGreaterThan(0);
    expect(loads.totalNormalForceN).toBeGreaterThan(0);
    expect(loads.gearStations.some((station) => station.normalForceN > 0)).toBe(true);
  });

  it('reports dynamic oleo station loads on touchdown without changing settled static loads', () => {
    const staticState = createInitialState(B737_800_SPEC);
    staticState.position.alt = KSEA_RUNWAY_ALT_FT;
    staticState.velocity.w = 0;
    staticState.config.gearDown = true;

    const settled = applyGroundContact(staticState, idle, 1 / 60, KSEA_RUNWAY_ALT_FT, { normalForceN: 100_000 });

    expect(settled.normalForceN).toBeCloseTo(100_000, 6);
    expect(settled.gearStations.map((station) => station.normalForceN)).toEqual([10_000, 45_000, 45_000]);

    const touchdownState = createInitialState(B737_800_SPEC);
    touchdownState.ground = {
      ...touchdownState.ground,
      weightOnWheels: false,
      normalForceN: 0,
      onRunway: false,
      contact: 'none',
      gearStations: createB737GearStations(0, false),
    };
    touchdownState.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    touchdownState.velocity.w = 3;
    touchdownState.config.gearDown = true;

    const touchdown = applyGroundContact(touchdownState, idle, 1 / 60, KSEA_RUNWAY_ALT_FT, { normalForceN: 100_000 });

    expect(touchdown.normalForceN).toBeGreaterThan(100_000);
    expect(touchdown.gearStations.reduce((sum, station) => sum + station.normalForceN, 0)).toBeCloseTo(touchdown.normalForceN, 6);
    expect(touchdown.gearStations.find((station) => station.id === 'leftMain')?.compressionM)
      .toBeGreaterThan(settled.gearStations.find((station) => station.id === 'leftMain')?.compressionM ?? 0);

    const zeroResidualState = createInitialState(B737_800_SPEC);
    zeroResidualState.ground = {
      ...zeroResidualState.ground,
      weightOnWheels: false,
      normalForceN: 0,
      onRunway: false,
      contact: 'none',
      gearStations: createB737GearStations(0, false),
    };
    zeroResidualState.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    zeroResidualState.velocity.w = 3;
    zeroResidualState.config.gearDown = true;

    const zeroResidualTouchdown = applyGroundContact(zeroResidualState, idle, 1 / 60, KSEA_RUNWAY_ALT_FT, { normalForceN: 0 });

    expect(zeroResidualTouchdown.normalForceN).toBeGreaterThan(0);
    expect(zeroResidualTouchdown.gearStations.some((station) => station.normalForceN > 0)).toBe(true);
  });

  it('clears gear station weight and force when airborne', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT + 1000;

    const contact = applyGroundContact(state, idle, 1 / 60);

    expect(contact.weightOnWheels).toBe(false);
    expect(contact.gearStations.every((station) => !station.weightOnWheel)).toBe(true);
    expect(contact.gearStations.every((station) => station.normalForceN === 0)).toBe(true);
  });

  it('clamps a gear-down aircraft to the KSEA runway instead of letting it sink', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 25;
    state.velocity.w = 7;
    state.config.gearDown = true;

    const contact = applyGroundContact(state, idle, 1 / 60);

    expect(contact.weightOnWheels).toBe(true);
    expect(contact.groundAltFt).toBe(KSEA_RUNWAY_ALT_FT);
    expect(contact.aglFt).toBe(0);
    expect(contact.contact).toBe('gear');
    expect(contact.onRunway).toBe(true);
    expect(contact.normalForceN).toBeGreaterThan(0);
    expect(state.ground).toEqual(contact);
    expect(state.position.alt).toBe(KSEA_RUNWAY_ALT_FT);
    expect(state.velocity.w).toBe(0);
  });

  it('does not clamp an aircraft that is clearly above the runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT + 1000;
    state.velocity.w = 5;
    state.config.gearDown = true;

    const contact = applyGroundContact(state, idle, 1 / 60);

    expect(contact.weightOnWheels).toBe(false);
    expect(contact.aglFt).toBe(1000);
    expect(contact.contact).toBe('none');
    expect(contact.normalForceN).toBe(0);
    expect(state.ground).toEqual(contact);
    expect(state.position.alt).toBe(KSEA_RUNWAY_ALT_FT + 1000);
    expect(state.velocity.w).toBe(5);
  });

  it('records belly or crash contact for gear-up aircraft below the runway instead of silent sink-through', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 5;
    state.velocity.w = 2;
    state.config.gearDown = false;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    const contact = applyGroundContact(state, gearUp, 1 / 60);

    expect(contact.weightOnWheels).toBe(false);
    expect(contact.onRunway).toBe(true);
    expect(['belly', 'crashed']).toContain(contact.contact);
    expect(state.ground).toEqual(contact);
    expect(state.position.alt).toBe(KSEA_RUNWAY_ALT_FT);
  });

  it('reports off-runway gear contact without pretending it is prepared runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.config.gearDown = true;
    const offRunwaySurface = sampleKseaSurface(state.position);

    const contact = applyGroundContact(state, idle, 1 / 60, KSEA_RUNWAY_ALT_FT, {
      surface: offRunwaySurface,
    });

    expect(offRunwaySurface.kind).toBe('offRunway');
    expect(contact.contact).toBe('gear');
    expect(contact.weightOnWheels).toBe(true);
    expect(contact.onRunway).toBe(false);
  });

  it('marks contact off-runway when a loaded wheel crosses the runway edge even if the aircraft reference is still inside', () => {
    const state = createInitialState(B737_800_SPEC);
    const headingRad = KSEA_RUNWAY_16L.headingDeg * DEG_TO_RAD;
    const nearRightEdgeM = KSEA_RUNWAY_16L.widthM / 2 - 3;
    state.position = offsetPositionMeters(
      KSEA_RUNWAY_16L.start,
      Math.cos(headingRad) * 600 - Math.sin(headingRad) * nearRightEdgeM,
      Math.sin(headingRad) * 600 + Math.cos(headingRad) * nearRightEdgeM,
    );
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.attitude = { ...state.attitude, psi: headingRad };
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
    state.config.gearDown = true;
    const centerSurface = sampleSupportedAirportSurface(state.position);

    const contact = applyGroundContact(state, idle, 1 / 60, KSEA_RUNWAY_ALT_FT, {
      surface: centerSurface,
    });

    expect(centerSurface.kind).toBe('runway');
    expect(contact.contact).toBe('gear');
    expect(contact.weightOnWheels).toBe(true);
    expect(contact.onRunway).toBe(false);
  });

  it('reports off-runway gear-up belly contact without setting onRunway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    state.config.gearDown = false;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };
    const offRunwaySurface = sampleKseaSurface(state.position);

    const contact = applyGroundContact(state, gearUp, 1 / 60, KSEA_RUNWAY_ALT_FT, {
      surface: offRunwaySurface,
    });

    expect(offRunwaySurface.kind).toBe('offRunway');
    expect(contact.contact).toBe('belly');
    expect(contact.weightOnWheels).toBe(false);
    expect(contact.onRunway).toBe(false);
  });

  it('decelerates a gear-up belly slide without treating it as weight-on-wheels', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    state.velocity.u = 70;
    state.velocity.v = 5;
    state.velocity.w = 2;
    state.config.gearDown = false;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };
    const initialSlideSpeed = Math.hypot(state.velocity.u, state.velocity.v);

    const contact = applyGroundContact(state, gearUp, 1, KSEA_RUNWAY_ALT_FT);

    expect(contact.contact).toBe('belly');
    expect(contact.weightOnWheels).toBe(false);
    expect(contact.gearStations.every((station) => !station.weightOnWheel)).toBe(true);
    expect(Math.hypot(state.velocity.u, state.velocity.v)).toBeLessThan(initialSlideSpeed);
    expect(Math.hypot(state.velocity.u, state.velocity.v)).toBeGreaterThan(0);
  });

  it('clamps gear-up belly slide deceleration at zero instead of reversing low-speed motion', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    state.velocity.u = 1;
    state.velocity.v = 0.2;
    state.velocity.w = 1;
    state.config.gearDown = false;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    const contact = applyGroundContact(state, gearUp, 1, KSEA_RUNWAY_ALT_FT);

    expect(contact.contact).toBe('belly');
    expect(state.velocity.u).toBe(0);
    expect(state.velocity.v).toBe(0);
  });

  it('clamps low-speed gear-up belly slide using runway-tangent velocity while pitched', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    state.attitude.theta = 10 * Math.PI / 180;
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
    state.velocity = nedToBody({ north: -1, east: 0, down: 1 }, state.attitude);
    state.config.gearDown = false;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    const contact = applyGroundContact(state, gearUp, 1, KSEA_RUNWAY_ALT_FT);
    const runwayVelocity = bodyToNed(state.velocity, state.attitude);

    expect(contact.contact).toBe('belly');
    expect(Math.hypot(runwayVelocity.north, runwayVelocity.east)).toBeCloseTo(0, 8);
    expect(runwayVelocity.down).toBeCloseTo(0, 8);
  });

  it('damps a hard gear-up crash more aggressively than a lower-energy belly slide', () => {
    const belly = createInitialState(B737_800_SPEC);
    belly.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    belly.velocity.u = 70;
    belly.velocity.w = 2;
    belly.angularVel.p = 0.4;
    belly.angularVel.q = -0.3;
    belly.angularVel.r = 0.2;
    belly.config.gearDown = false;

    const crash = createInitialState(B737_800_SPEC);
    crash.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    crash.velocity.u = 70;
    crash.velocity.w = 8;
    crash.angularVel.p = 0.4;
    crash.angularVel.q = -0.3;
    crash.angularVel.r = 0.2;
    crash.config.gearDown = false;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    const bellyContact = applyGroundContact(belly, gearUp, 1, KSEA_RUNWAY_ALT_FT);
    const crashContact = applyGroundContact(crash, gearUp, 1, KSEA_RUNWAY_ALT_FT);

    expect(bellyContact.contact).toBe('belly');
    expect(crashContact.contact).toBe('crashed');
    expect(crash.velocity.u).toBeLessThan(belly.velocity.u);
    expect(Math.abs(crash.angularVel.p)).toBeLessThan(Math.abs(belly.angularVel.p));
    expect(Math.abs(crash.angularVel.q)).toBeLessThan(Math.abs(belly.angularVel.q));
    expect(Math.abs(crash.angularVel.r)).toBeLessThan(Math.abs(belly.angularVel.r));
  });

  it('applies gear-up angular damping as a timestep-scaled rate', () => {
    const oneSecond = createInitialState(B737_800_SPEC);
    oneSecond.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    oneSecond.velocity.w = 1;
    oneSecond.angularVel.p = 0.4;
    oneSecond.config.gearDown = false;

    const fixedStep = createInitialState(B737_800_SPEC);
    fixedStep.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    fixedStep.velocity.w = 1;
    fixedStep.angularVel.p = 0.4;
    fixedStep.config.gearDown = false;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    applyGroundContact(oneSecond, gearUp, 1, KSEA_RUNWAY_ALT_FT);
    for (let i = 0; i < 60; i += 1) {
      applyGroundContact(fixedStep, gearUp, 1 / 60, KSEA_RUNWAY_ALT_FT);
    }

    expect(oneSecond.ground.contact).toBe('belly');
    expect(fixedStep.ground.contact).toBe('belly');
    expect(fixedStep.angularVel.p).toBeCloseTo(oneSecond.angularVel.p, 5);
  });

  it('persists hard gear-up crash contact across fixed-step slide damping', () => {
    const belly = createInitialState(B737_800_SPEC);
    belly.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    belly.velocity.u = 70;
    belly.velocity.w = 2;
    belly.angularVel.p = 0.4;
    belly.config.gearDown = false;

    const crash = createInitialState(B737_800_SPEC);
    crash.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    crash.velocity.u = 70;
    crash.velocity.w = 8;
    crash.angularVel.p = 0.4;
    crash.config.gearDown = false;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    for (let i = 0; i < 60; i += 1) {
      applyGroundContact(belly, gearUp, 1 / 60, KSEA_RUNWAY_ALT_FT);
      applyGroundContact(crash, gearUp, 1 / 60, KSEA_RUNWAY_ALT_FT);
    }

    expect(belly.ground.contact).toBe('belly');
    expect(crash.ground.contact).toBe('crashed');
    expect(crash.velocity.u).toBeLessThan(belly.velocity.u);
    expect(Math.abs(crash.angularVel.p)).toBeLessThan(Math.abs(belly.angularVel.p));
  });

  it('classifies gear-up impact using runway-normal sink rate, not body-axis w', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    state.config.gearDown = false;
    state.attitude.theta = 10 * Math.PI / 180;
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
    state.velocity.u = 90;
    state.velocity.w = Math.tan(state.attitude.theta) * state.velocity.u;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    const contact = applyGroundContact(state, gearUp, 1 / 60);

    expect(bodyToNed(state.velocity, state.attitude).down).toBeCloseTo(0, 8);
    expect(contact.contact).toBe('belly');
  });

  it('constrains runway-normal velocity instead of zeroing body vertical speed while pitched up', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 90;
    state.velocity.w = 0;
    state.attitude.theta = 10 * Math.PI / 180;
    state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);

    applyGroundContact(state, idle, 1 / 120);

    const ned = bodyToNed(state.velocity, state.attitude);
    expect(ned.down).toBeCloseTo(0, 8);
    expect(state.velocity.w).toBeGreaterThan(0);
  });

  it('damps touchdown sink rate and angular rates on first gear contact', () => {
    const state = createInitialState(B737_800_SPEC);
    state.ground = {
      ...state.ground,
      weightOnWheels: false,
      normalForceN: 0,
      onRunway: false,
      contact: 'none',
      gearStations: createB737GearStations(0, false),
    };
    state.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    state.velocity.u = 65;
    state.velocity.w = 3;
    state.angularVel.p = 0.4;
    state.angularVel.q = -0.6;
    state.angularVel.r = 0.2;

    const contact = applyGroundContact(state, idle, 1 / 120);

    expect(contact.weightOnWheels).toBe(true);
    expect(contact.lastTouchdownSinkRateMps).toBeCloseTo(3, 6);
    expect(bodyToNed(state.velocity, state.attitude).down).toBeCloseTo(0, 8);
    expect(Math.abs(state.angularVel.p)).toBeLessThan(0.4);
    expect(Math.abs(state.angularVel.q)).toBeLessThan(0.6);
    expect(Math.abs(state.angularVel.r)).toBeLessThan(0.2);
  });

  it('limits rudder-pedal nosewheel steering to pedal authority and fades it out at takeoff speed', () => {
    const fullPedalSteeringRad = 7 * Math.PI / 180;

    expect(computeNosewheelSteeringAngleRad({ ...idle, rudder: 1 }, 5)).toBeCloseTo(fullPedalSteeringRad, 8);
    expect(computeNosewheelSteeringAngleRad({ ...idle, rudder: -1 }, 5)).toBeCloseTo(-fullPedalSteeringRad, 8);
    expect(computeNosewheelSteeringAngleRad({ ...idle, rudder: 1 }, 80)).toBe(0);
  });

  it('exposes source-cited ground constants and allows helpers to use an overridden ground model', () => {
    expect(B737_800_FDM.ground.sourceReferenceIds.length).toBeGreaterThan(0);

    const customGroundModel = {
      ...B737_800_FDM.ground,
      steering: {
        ...B737_800_FDM.ground.steering,
        maxRudderPedalNosewheelSteeringRad: B737_800_FDM.ground.steering.maxRudderPedalNosewheelSteeringRad * 2,
      },
    };

    expect(computeNosewheelSteeringAngleRad({ ...idle, rudder: 1 }, 5, customGroundModel)).toBeCloseTo(
      B737_800_FDM.ground.steering.maxRudderPedalNosewheelSteeringRad * 2,
      8,
    );
  });

  it('applies nosewheel steering yaw rate and stores the steering angle on the nose station', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 8;
    state.config.gearDown = true;
    const taxiRight: ControlInputs = { ...idle, rudder: 1 };

    const contact = applyGroundContact(state, taxiRight, 1 / 2);

    const nose = contact.gearStations.find((station) => station.id === 'nose');
    expect(nose?.steeringAngleRad).toBeGreaterThan(0.1);
    expect(nose?.steeringAngleRad).toBeLessThan(0.13);
    expect(state.angularVel.r).toBeGreaterThan(0);
    expect(state.angularVel.r).toBeLessThan(0.5);
  });

  it('damps lateral scrub while taxiing on loaded wheels', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 6;
    state.velocity.v = 3;
    state.config.gearDown = true;

    applyGroundContact(state, idle, 1);

    expect(Math.abs(state.velocity.v)).toBeLessThan(3);
  });

  it('computes tire side force that opposes lateral skid and is friction limited', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 35;
    state.velocity.v = 8;
    const gearStations = createB737GearStations(100_000, true);

    const sideForces = computeTireSideForces(state, gearStations);

    expect(sideForces.loadedNormalForceN).toBeCloseTo(100_000, 6);
    expect(sideForces.sideForceN).toBeLessThan(0);
    expect(Math.abs(sideForces.sideForceN)).toBeLessThanOrEqual(45_000);
    expect(sideForces.frictionLimited).toBe(true);
    expect(sideForces.lateralAccelerationMps2).toBeCloseTo(sideForces.sideForceN / state.grossWeight, 8);
  });

  it('scales rolling resistance higher on off-runway ground than prepared runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 20;
    const gearStations = createB737GearStations(100_000, true);
    const runwaySurface = sampleKseaSurface({
      lat: KSEA_RUNWAY_16L.start.lat,
      lon: KSEA_RUNWAY_16L.start.lon,
      alt: KSEA_RUNWAY_16L.elevationFt,
    });
    const offRunwaySurface = sampleKseaSurface(offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80));

    const runwayForces = computeGroundRollForces(state, idle, gearStations, runwaySurface);
    const offRunwayForces = computeGroundRollForces(state, idle, gearStations, offRunwaySurface);

    expect(runwaySurface.kind).toBe('runway');
    expect(offRunwaySurface.kind).toBe('offRunway');
    expect(offRunwayForces.rollingFrictionForceN).toBeGreaterThan(runwayForces.rollingFrictionForceN * 2);
  });

  it('reduces peak brake and side grip on off-runway ground', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 35;
    state.velocity.v = 8;
    const gearStations = createB737GearStations(100_000, true);
    const runwaySurface = sampleKseaSurface({
      lat: KSEA_RUNWAY_16L.start.lat,
      lon: KSEA_RUNWAY_16L.start.lon,
      alt: KSEA_RUNWAY_16L.elevationFt,
    });
    const offRunwaySurface = sampleKseaSurface(offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80));

    const runwayBrake = computeWheelBrakeForces(state, { leftBrake: 1, rightBrake: 1 }, gearStations, runwaySurface);
    const offRunwayBrake = computeWheelBrakeForces(state, { leftBrake: 1, rightBrake: 1 }, gearStations, offRunwaySurface);
    const runwaySide = computeTireSideForces(state, gearStations, runwaySurface);
    const offRunwaySide = computeTireSideForces(state, gearStations, offRunwaySurface);

    expect(offRunwayBrake.brakeForceN).toBeLessThan(runwayBrake.brakeForceN);
    expect(offRunwayBrake.antiSkidLimited).toBe(true);
    expect(offRunwaySide.peakSideForceN).toBeLessThan(runwaySide.peakSideForceN);
  });

  it('does not create tire side force from unloaded gear stations', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 35;
    state.velocity.v = 8;
    const unloadedGearStations = createB737GearStations(100_000, false);

    const sideForces = computeTireSideForces(state, unloadedGearStations);

    expect(sideForces.loadedNormalForceN).toBe(0);
    expect(sideForces.sideForceN).toBe(0);
    expect(sideForces.yawMomentNm).toBe(0);
    expect(sideForces.frictionLimited).toBe(false);
  });

  it('uses tire side force to reduce lateral velocity on loaded wheels without crossing zero', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 25;
    state.velocity.v = 2;
    state.config.gearDown = true;

    applyGroundContact(state, idle, 1, KSEA_RUNWAY_ALT_FT, { normalForceN: state.grossWeight * 9.80665 });

    expect(state.velocity.v).toBeGreaterThanOrEqual(0);
    expect(state.velocity.v).toBeLessThan(2);
  });

  it('does not generate side motion from steering input while stopped', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 0;
    state.velocity.v = 0;
    state.angularVel.r = 0;
    state.config.gearDown = true;
    const steeringWhileStopped: ControlInputs = { ...idle, rudder: 1 };

    applyGroundContact(state, steeringWhileStopped, 1, KSEA_RUNWAY_ALT_FT, { normalForceN: state.grossWeight * 9.80665 });

    expect(state.velocity.v).toBe(0);
    expect(state.angularVel.r).toBe(0);
  });

  it('treats held steering as neutral for stopped lateral-scrub zero crossing', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 0;
    state.velocity.v = 2;
    state.angularVel.r = 0;
    state.config.gearDown = true;
    const steeringWhileStopped: ControlInputs = { ...idle, rudder: 1 };

    applyGroundContact(state, steeringWhileStopped, 1, KSEA_RUNWAY_ALT_FT, { normalForceN: state.grossWeight * 9.80665 });

    expect(state.velocity.v).toBeGreaterThanOrEqual(0);
    expect(state.velocity.v).toBeLessThan(2);
  });

  it('computes rolling friction and brake force from gear station loads', () => {
    const state = createInitialState(B737_800_SPEC);
    state.grossWeight = 10_000;
    state.velocity.u = 20;
    const gearStations = createB737GearStations(100_000, true);
    const braking: ControlInputs = { ...idle, brake: 1 };

    const forces = computeGroundRollForces(state, braking, gearStations);

    expect(forces.rollingNormalForceN).toBe(100_000);
    expect(forces.brakeNormalForceN).toBe(90_000);
    expect(forces.brakeForceN).toBeGreaterThan(forces.rollingFrictionForceN);
    expect(forces.brakeForceN).toBeLessThan(100_000 * (6 / 9.80665));
    expect(forces.accelerationMps2).toBeCloseTo(forces.retardingForceN / 10_000, 8);
  });

  it('uses side-specific brake controls to create yaw while rolling forward', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 10;
    const gearStations = createB737GearStations(100_000, true);

    const forces = computeGroundRollForces(
      state,
      { ...idle, brake: 0, leftBrake: 1, rightBrake: 0 },
      gearStations,
    );

    expect(forces.brakeForceN).toBeGreaterThan(0);
    expect(forces.yawMomentNm).toBeLessThan(0);
    expect(forces.yawAccelerationRadps2).toBeLessThan(0);
  });

  it('loads only the commanded main station for side-specific wheel braking', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 10;
    const gearStations = createB737GearStations(100_000, true);

    const forces = computeWheelBrakeForces(state, { leftBrake: 1, rightBrake: 0 }, gearStations);
    const nose = forces.stationForces.find((station) => station.stationId === 'nose');
    const leftMain = forces.stationForces.find((station) => station.stationId === 'leftMain');
    const rightMain = forces.stationForces.find((station) => station.stationId === 'rightMain');

    expect(nose?.brakeCommand).toBe(0);
    expect(nose?.brakeForceN).toBe(0);
    expect(leftMain?.brakeCommand).toBe(1);
    expect(leftMain?.brakeForceN).toBeGreaterThan(0);
    expect(rightMain?.brakeCommand).toBe(0);
    expect(rightMain?.brakeForceN).toBe(0);
    expect(forces.leftBrakeForceN).toBeGreaterThan(0);
    expect(forces.rightBrakeForceN).toBe(0);
  });

  it('keeps legacy symmetric brake equivalent to full left and right brake controls', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 10;
    const gearStations = createB737GearStations(100_000, true);

    const legacyBrake = computeGroundRollForces(state, { ...idle, brake: 1 }, gearStations);
    const sideSpecificBrakes = computeGroundRollForces(
      state,
      { ...idle, brake: 0, leftBrake: 1, rightBrake: 1 },
      gearStations,
    );

    expect(sideSpecificBrakes.brakeForceN).toBeCloseTo(legacyBrake.brakeForceN, 8);
    expect(sideSpecificBrakes.retardingForceN).toBeCloseTo(legacyBrake.retardingForceN, 8);
    expect(legacyBrake.yawMomentNm).toBeCloseTo(0, 8);
    expect(sideSpecificBrakes.yawMomentNm).toBeCloseTo(0, 8);
  });

  it('does not apply active differential brake force or yaw while stopped', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 0;
    const gearStations = createB737GearStations(100_000, true);

    const forces = computeGroundRollForces(
      state,
      { ...idle, brake: 0, leftBrake: 1, rightBrake: 0 },
      gearStations,
    );

    expect(forces.brakeForceN).toBe(0);
    expect(forces.yawMomentNm).toBe(0);
    expect(forces.yawAccelerationRadps2).toBe(0);
  });

  it('reverses side-specific brake yaw direction while rolling backward', () => {
    const state = createInitialState(B737_800_SPEC);
    const gearStations = createB737GearStations(100_000, true);

    state.velocity.u = 10;
    const forwardLeftBrake = computeGroundRollForces(
      state,
      { ...idle, brake: 0, leftBrake: 1, rightBrake: 0 },
      gearStations,
    );
    state.velocity.u = -10;
    const reverseLeftBrake = computeGroundRollForces(
      state,
      { ...idle, brake: 0, leftBrake: 1, rightBrake: 0 },
      gearStations,
    );

    expect(forwardLeftBrake.yawMomentNm).toBeLessThan(0);
    expect(reverseLeftBrake.yawMomentNm).toBeGreaterThan(0);
    expect(Math.abs(reverseLeftBrake.yawMomentNm)).toBeCloseTo(Math.abs(forwardLeftBrake.yawMomentNm), 8);
  });

  it('keeps brake yaw moment neutral for symmetric left/right braking', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 10;
    const gearStations = createB737GearStations(100_000, true);

    const forces = computeWheelBrakeForces(state, { leftBrake: 0.7, rightBrake: 0.7 }, gearStations);

    expect(forces.leftBrakeForceN).toBeCloseTo(forces.rightBrakeForceN, 8);
    expect(forces.yawMomentNm).toBeCloseTo(0, 8);
  });

  it('creates opposite yaw moments for left-only and right-only braking while rolling forward', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 10;
    const gearStations = createB737GearStations(100_000, true);

    const leftOnly = computeWheelBrakeForces(state, { leftBrake: 1, rightBrake: 0 }, gearStations);
    const rightOnly = computeWheelBrakeForces(state, { leftBrake: 0, rightBrake: 1 }, gearStations);

    expect(leftOnly.leftBrakeForceN).toBeGreaterThan(0);
    expect(leftOnly.rightBrakeForceN).toBe(0);
    expect(rightOnly.leftBrakeForceN).toBe(0);
    expect(rightOnly.rightBrakeForceN).toBeGreaterThan(0);
    expect(leftOnly.yawMomentNm).toBeLessThan(0);
    expect(rightOnly.yawMomentNm).toBeGreaterThan(0);
    expect(Math.abs(leftOnly.yawMomentNm)).toBeCloseTo(Math.abs(rightOnly.yawMomentNm), 8);
  });

  it('reverses asymmetric brake yaw direction while rolling backward', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = -10;
    const gearStations = createB737GearStations(100_000, true);

    const leftOnly = computeWheelBrakeForces(state, { leftBrake: 1, rightBrake: 0 }, gearStations);
    const rightOnly = computeWheelBrakeForces(state, { leftBrake: 0, rightBrake: 1 }, gearStations);

    expect(leftOnly.leftBrakeForceN).toBeGreaterThan(0);
    expect(rightOnly.rightBrakeForceN).toBeGreaterThan(0);
    expect(leftOnly.yawMomentNm).toBeGreaterThan(0);
    expect(rightOnly.yawMomentNm).toBeLessThan(0);
    expect(Math.abs(leftOnly.yawMomentNm)).toBeCloseTo(Math.abs(rightOnly.yawMomentNm), 8);
  });

  it('does not create asymmetric brake yaw while stopped', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 0;
    const gearStations = createB737GearStations(100_000, true);

    const leftOnly = computeWheelBrakeForces(state, { leftBrake: 1, rightBrake: 0 }, gearStations);
    const rightOnly = computeWheelBrakeForces(state, { leftBrake: 0, rightBrake: 1 }, gearStations);

    expect(leftOnly.brakeForceN).toBe(0);
    expect(leftOnly.yawMomentNm).toBe(0);
    expect(rightOnly.brakeForceN).toBe(0);
    expect(rightOnly.yawMomentNm).toBe(0);
  });

  it('anti-skid caps brake force to tire friction on loaded brake-capable wheels', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 20;
    const gearStations = createB737GearStations(100_000, true);

    const forces = computeWheelBrakeForces(state, { leftBrake: 1, rightBrake: 1 }, gearStations);

    expect(forces.antiSkidLimited).toBe(true);
    expect(forces.brakeForceN).toBeLessThan(forces.requestedBrakeForceN);
    expect(forces.brakeForceN).toBeCloseTo(90_000 * 0.55, 6);
  });

  it('applies brake deceleration from loaded brake-capable stations without reversing direction', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 20;
    state.grossWeight = 10_000;
    state.config.gearDown = true;
    const braking: ControlInputs = { ...idle, brake: 1 };

    applyGroundContact(state, braking, 1, KSEA_RUNWAY_ALT_FT, { normalForceN: 100_000 });

    expect(state.velocity.u).toBeGreaterThanOrEqual(0);
    expect(state.velocity.u).toBeCloseTo(14.6931, 3);
  });

  it('applies rolling and brake deceleration on the runway without reversing direction', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 20;
    state.config.gearDown = true;
    const braking: ControlInputs = { ...idle, brake: 1 };

    applyGroundContact(state, braking, 1);

    expect(state.velocity.u).toBeGreaterThanOrEqual(0);
    expect(state.velocity.u).toBeLessThan(20);
  });

  it('scales tire braking by normal force instead of applying full braking after gear unloads', () => {
    const unloaded = createInitialState(B737_800_SPEC);
    unloaded.position.alt = KSEA_RUNWAY_ALT_FT;
    unloaded.velocity.u = 20;
    unloaded.config.gearDown = true;
    const braking: ControlInputs = { ...idle, brake: 1 };

    applyGroundContact(unloaded, braking, 1, KSEA_RUNWAY_ALT_FT, { normalForceN: 0 });

    expect(unloaded.velocity.u).toBeCloseTo(20, 9);

    const loaded = createInitialState(B737_800_SPEC);
    loaded.position.alt = KSEA_RUNWAY_ALT_FT;
    loaded.velocity.u = 20;
    loaded.config.gearDown = true;

    applyGroundContact(loaded, braking, 1);

    expect(loaded.velocity.u).toBeLessThan(unloaded.velocity.u);
  });

  it('prevents runaway nose-down attitude while still on runway contact', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.config.gearDown = true;
    state.attitude.theta = -1.2;

    applyGroundContact(state, idle, 1 / 60);

    expect(state.attitude.theta).toBeGreaterThanOrEqual(0);
  });

  it('does not snap tiny forward speed to zero when takeoff thrust is commanded', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 0.03;
    state.config.gearDown = true;

    const takeoff: ControlInputs = {
      ...idle,
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
      brake: 0,
    };

    applyGroundContact(state, takeoff, 1 / 120);

    expect(state.velocity.u).toBeGreaterThan(0);
  });

  it('still snaps an idle nearly-stopped aircraft to zero', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 0.03;
    state.config.gearDown = true;

    applyGroundContact(state, idle, 1 / 120);

    expect(state.velocity.u).toBe(0);
  });
});
