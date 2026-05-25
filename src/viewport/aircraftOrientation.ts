import * as THREE from 'three';
import type { Attitude } from '../sim/types';

/**
 * Build the local ENU orientation for the procedural aircraft model.
 *
 * three-to-cesium positions child objects inside an ENU frame where:
 *   local X = east, local Y = north, local Z = up.
 *
 * Keep the procedural aircraft in the same ENU-friendly convention:
 *   model +Y = nose/forward, model +X = right wing, model +Z = up.
 *
 * RFS physics uses body axes x=forward, y=right, z=down and NED attitude.
 * This quaternion maps the model's ENU-friendly axes through the aircraft
 * body attitude so the wings stay lateral and the wheels stay below the
 * aircraft instead of rolling a Three.js Y-up mesh onto its side.
 */
export function createAircraftModelQuaternion(attitude: Attitude): THREE.Quaternion {
  const { phi, theta, psi } = attitude;
  const sphi = Math.sin(phi), cphi = Math.cos(phi);
  const sth = Math.sin(theta), cth = Math.cos(theta);
  const spsi = Math.sin(psi), cpsi = Math.cos(psi);

  // Body +X (forward) transformed to local ENU.
  const forward = new THREE.Vector3(
    cth * spsi,
    cth * cpsi,
    sth,
  ).normalize();

  // Body +Y (right) transformed to local ENU.
  const right = new THREE.Vector3(
    sphi * sth * spsi + cphi * cpsi,
    sphi * sth * cpsi - cphi * spsi,
    -sphi * cth,
  ).normalize();

  // Body +Z is down; model +Z is up, so invert body-down in local ENU.
  const up = new THREE.Vector3(
    -(cphi * sth * spsi - sphi * cpsi),
    -(cphi * sth * cpsi + sphi * spsi),
    cphi * cth,
  ).normalize();

  const matrix = new THREE.Matrix4().makeBasis(right, forward, up);
  return new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
}
