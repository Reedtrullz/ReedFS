import { describe, expect, it } from 'vitest';
import { createInitialState, B737_800_SPEC, createB737GearStations } from '../../types';
import type { ControlInputs } from '../../types';
import { applyGroundContact, computeGroundRollForces, computeNosewheelSteeringAngleRad, KSEA_RUNWAY_ALT_FT } from '../ground';
import { bodyToNed } from '../../physics/frames';
import { eulerToQuat } from '../../physics/quaternion';

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

describe('applyGroundContact', () => {
  it('initial state starts on the runway with explicit gear contact state', () => {
    const state = createInitialState(B737_800_SPEC);

    expect(state.ground.weightOnWheels).toBe(true);
    expect(state.ground.aglFt).toBe(0);
    expect(state.ground.groundAltFt).toBe(KSEA_RUNWAY_ALT_FT);
    expect(state.ground.contact).toBe('gear');
    expect(state.ground.onRunway).toBe(true);
    expect(state.ground.normalForceN).toBeGreaterThan(0);
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

  it('maps rudder command to nosewheel steering at taxi speed and fades it out at takeoff speed', () => {
    expect(computeNosewheelSteeringAngleRad({ ...idle, rudder: 1 }, 5)).toBeGreaterThan(0.6);
    expect(computeNosewheelSteeringAngleRad({ ...idle, rudder: -1 }, 5)).toBeLessThan(-0.6);
    expect(computeNosewheelSteeringAngleRad({ ...idle, rudder: 1 }, 80)).toBe(0);
  });

  it('applies nosewheel steering yaw rate and stores the steering angle on the nose station', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 8;
    state.config.gearDown = true;
    const taxiRight: ControlInputs = { ...idle, rudder: 1 };

    const contact = applyGroundContact(state, taxiRight, 1 / 2);

    const nose = contact.gearStations.find((station) => station.id === 'nose');
    expect(nose?.steeringAngleRad).toBeGreaterThan(0.6);
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

  it('computes rolling friction and brake force from gear station loads', () => {
    const state = createInitialState(B737_800_SPEC);
    state.grossWeight = 10_000;
    const gearStations = createB737GearStations(100_000, true);
    const braking: ControlInputs = { ...idle, brake: 1 };

    const forces = computeGroundRollForces(state, braking, gearStations);

    expect(forces.rollingNormalForceN).toBe(100_000);
    expect(forces.brakeNormalForceN).toBe(90_000);
    expect(forces.brakeForceN).toBeGreaterThan(forces.rollingFrictionForceN);
    expect(forces.brakeForceN).toBeLessThan(100_000 * (6 / 9.80665));
    expect(forces.accelerationMps2).toBeCloseTo(forces.retardingForceN / 10_000, 8);
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
    expect(state.velocity.u).toBeCloseTo(14.1366, 3);
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
