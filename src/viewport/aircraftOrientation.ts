import * as THREE from 'three';
import type { Attitude } from '../sim/types';

/**
 * Build the local ENU orientation for the procedural aircraft model.
 *
 * three-to-cesium positions child objects inside an ENU frame where:
 *   local X = east, local Y = north, local Z = up.
 *
 * The procedural aircraft mesh follows Three.js' right-handed aircraft shape:
 *   model -Z = nose/forward, model +X = right wing, model +Y = up.
 *
 * RFS physics uses body axes x=forward, y=right, z=down and NED attitude.
 * This quaternion maps model axes through the aircraft body attitude into ENU
 * so the nose points along track instead of straight up like a rocket.
 */
export function createAircraftModelQuaternion(attitude: Attitude): THREE.Quaternion {
  const { phi, theta, psi } = attitude;
  const sphi = Math.sin(phi), cphi = Math.cos(phi);
  const sth = Math.sin(theta), cth = Math.cos(theta);
  const spsi = Math.sin(psi), cpsi = Math.cos(psi);

  // Body +X (forward) transformed to ENU.
  const forward = new THREE.Vector3(
    cth * spsi,
    cth * cpsi,
    sth,
  ).normalize();

  // Body +Y (right) transformed to ENU.
  const right = new THREE.Vector3(
    sphi * sth * spsi + cphi * cpsi,
    sphi * sth * cpsi - cphi * spsi,
    -sphi * cth,
  ).normalize();

  // Body +Z is down; model +Y is up, so invert body-down in ENU.
  const up = new THREE.Vector3(
    -(cphi * sth * spsi - sphi * cpsi),
    -(cphi * sth * cpsi + sphi * spsi),
    cphi * cth,
  ).normalize();

  // Model +Z is backward because the nose points down model -Z.
  const backward = forward.clone().negate();
  const matrix = new THREE.Matrix4().makeBasis(right, up, backward);
  return new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
}
