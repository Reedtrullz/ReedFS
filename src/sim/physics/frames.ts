import type { Attitude, BodyVelocity } from '../types';

/**
 * Direction cosine transforms between aircraft body axes and local NED axes.
 * Body: x forward, y right, z down. NED: north, east, down.
 * Euler convention matches Attitude: phi roll (+right wing down), theta pitch (+nose up), psi heading (0=north).
 */
export interface NedVelocity {
  north: number;
  east: number;
  down: number;
}

export function bodyToNed(body: BodyVelocity, attitude: Attitude): NedVelocity {
  const { u, v, w } = body;
  const { phi, theta, psi } = attitude;
  const sphi = Math.sin(phi), cphi = Math.cos(phi);
  const sth = Math.sin(theta), cth = Math.cos(theta);
  const spsi = Math.sin(psi), cpsi = Math.cos(psi);

  return {
    north: cth * cpsi * u + (sphi * sth * cpsi - cphi * spsi) * v + (cphi * sth * cpsi + sphi * spsi) * w,
    east: cth * spsi * u + (sphi * sth * spsi + cphi * cpsi) * v + (cphi * sth * spsi - sphi * cpsi) * w,
    down: -sth * u + sphi * cth * v + cphi * cth * w,
  };
}

export function nedToBody(ned: NedVelocity, attitude: Attitude): BodyVelocity {
  const { north, east, down } = ned;
  const { phi, theta, psi } = attitude;
  const sphi = Math.sin(phi), cphi = Math.cos(phi);
  const sth = Math.sin(theta), cth = Math.cos(theta);
  const spsi = Math.sin(psi), cpsi = Math.cos(psi);

  return {
    u: cth * cpsi * north + cth * spsi * east - sth * down,
    v: (sphi * sth * cpsi - cphi * spsi) * north + (sphi * sth * spsi + cphi * cpsi) * east + sphi * cth * down,
    w: (cphi * sth * cpsi + sphi * spsi) * north + (cphi * sth * spsi - sphi * cpsi) * east + cphi * cth * down,
  };
}
