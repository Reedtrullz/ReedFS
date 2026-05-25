import { describe, expect, it } from 'vitest';
import { bodyToNed, nedToBody } from '../frames';
import type { Attitude, BodyVelocity } from '../../types';

const levelNorth: Attitude = { phi: 0, theta: 0, psi: 0 };
const levelEast: Attitude = { phi: 0, theta: 0, psi: Math.PI / 2 };
const levelSouth: Attitude = { phi: 0, theta: 0, psi: Math.PI };

function expectBodyClose(actual: BodyVelocity, expected: BodyVelocity): void {
  expect(actual.u).toBeCloseTo(expected.u, 8);
  expect(actual.v).toBeCloseTo(expected.v, 8);
  expect(actual.w).toBeCloseTo(expected.w, 8);
}

describe('bodyToNed', () => {
  it('maps level north forward velocity to positive north', () => {
    expect(bodyToNed({ u: 10, v: 0, w: 0 }, levelNorth)).toEqual({ north: 10, east: 0, down: 0 });
  });

  it('maps level south forward velocity to negative north', () => {
    const ned = bodyToNed({ u: 10, v: 0, w: 0 }, levelSouth);
    expect(ned.north).toBeCloseTo(-10, 8);
    expect(ned.east).toBeCloseTo(0, 8);
    expect(ned.down).toBeCloseTo(0, 8);
  });

  it('maps level east forward velocity to positive east', () => {
    const ned = bodyToNed({ u: 10, v: 0, w: 0 }, levelEast);
    expect(ned.north).toBeCloseTo(0, 8);
    expect(ned.east).toBeCloseTo(10, 8);
    expect(ned.down).toBeCloseTo(0, 8);
  });

  it('maps nose-up forward velocity to upward NED velocity', () => {
    const ned = bodyToNed({ u: 10, v: 0, w: 0 }, { phi: 0, theta: Math.PI / 6, psi: 0 });
    expect(ned.north).toBeCloseTo(10 * Math.cos(Math.PI / 6), 8);
    expect(ned.east).toBeCloseTo(0, 8);
    expect(ned.down).toBeCloseTo(-5, 8);
  });

  it('maps positive roll right-body velocity to downward NED velocity', () => {
    const ned = bodyToNed({ u: 0, v: 10, w: 0 }, { phi: Math.PI / 6, theta: 0, psi: 0 });
    expect(ned.north).toBeCloseTo(0, 8);
    expect(ned.east).toBeCloseTo(10 * Math.cos(Math.PI / 6), 8);
    expect(ned.down).toBeCloseTo(5, 8);
  });

  it('maps level NED axes back to body axes directly', () => {
    expectBodyClose(nedToBody({ north: 10, east: 0, down: 0 }, levelNorth), { u: 10, v: 0, w: 0 });
    expectBodyClose(nedToBody({ north: 0, east: 10, down: 0 }, levelNorth), { u: 0, v: 10, w: 0 });
    expectBodyClose(nedToBody({ north: 0, east: 0, down: 10 }, levelNorth), { u: 0, v: 0, w: 10 });
  });

  it('round-trips body velocity through NED', () => {
    const attitude: Attitude = { phi: 0.2, theta: -0.1, psi: 1.3 };
    const body: BodyVelocity = { u: 120, v: 4, w: -3 };
    expectBodyClose(nedToBody(bodyToNed(body, attitude), attitude), body);
  });
});
