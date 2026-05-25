import { describe, expect, it } from 'vitest';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';
import { applyGroundContact, KSEA_RUNWAY_ALT_FT } from '../ground';

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
  it('clamps a gear-down aircraft to the KSEA runway instead of letting it sink', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 25;
    state.velocity.w = 7;
    state.config.gearDown = true;

    const contact = applyGroundContact(state, idle, 1 / 60);

    expect(contact.weightOnWheels).toBe(true);
    expect(contact.groundAltFt).toBe(KSEA_RUNWAY_ALT_FT);
    expect(state.position.alt).toBe(KSEA_RUNWAY_ALT_FT);
    expect(state.velocity.w).toBe(0);
  });

  it('does not clamp an aircraft that is clearly above the runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT + 500;
    state.velocity.w = 5;
    state.config.gearDown = true;

    const contact = applyGroundContact(state, idle, 1 / 60);

    expect(contact.weightOnWheels).toBe(false);
    expect(state.position.alt).toBe(KSEA_RUNWAY_ALT_FT + 500);
    expect(state.velocity.w).toBe(5);
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
