import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBoeing737Model } from '../AircraftModel';

const REQUIRED_PART_NAMES = [
  'fuselage',
  'cockpitWindows',
  'leftWing',
  'rightWing',
  'leftFlap',
  'rightFlap',
  'leftAileron',
  'rightAileron',
  'horizontalStabilizer',
  'leftElevator',
  'rightElevator',
  'verticalStabilizer',
  'rudder',
  'noseGear',
  'noseWheel',
  'leftMainGear',
  'leftMainWheel',
  'rightMainGear',
  'rightMainWheel',
  'leftEngine',
  'rightEngine',
  'leftFan',
  'rightFan',
  'lights',
  'leftNavLight',
  'rightNavLight',
  'tailNavLight',
  'beacon',
  'landingLight',
] as const;

const HINGE_FRIENDLY_PART_NAMES = [
  'leftFlap',
  'rightFlap',
  'leftAileron',
  'rightAileron',
  'leftElevator',
  'rightElevator',
  'rudder',
] as const;

function objectNamed(model: THREE.Object3D, name: string): THREE.Object3D {
  const object = model.getObjectByName(name);
  expect(object).toBeDefined();
  return object as THREE.Object3D;
}

function boxOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function centerOf(object: THREE.Object3D): THREE.Vector3 {
  return boxOf(object).getCenter(new THREE.Vector3());
}

function sizeOf(object: THREE.Object3D): THREE.Vector3 {
  return boxOf(object).getSize(new THREE.Vector3());
}

describe('createBoeing737Model', () => {
  it('exposes the named visual contract needed for deterministic aircraft animation', () => {
    const model = createBoeing737Model();

    REQUIRED_PART_NAMES.forEach((name) => {
      objectNamed(model, name);
    });

    HINGE_FRIENDLY_PART_NAMES.forEach((name) => {
      const object = objectNamed(model, name);
      expect(object).toBeInstanceOf(THREE.Group);
      expect(object.children.length).toBeGreaterThan(0);
    });
  });

  it('has 737-like length/span/height proportions in meters-ish model units', () => {
    const model = createBoeing737Model();
    const size = sizeOf(model);

    // Local aircraft convention is +Y forward, +X right wing, +Z up.
    const length = size.y;
    const span = size.x;
    const height = size.z;

    expect(length).toBeGreaterThanOrEqual(38);
    expect(length).toBeLessThanOrEqual(42);
    expect(span).toBeGreaterThanOrEqual(34);
    expect(span).toBeLessThanOrEqual(38);
    expect(height).toBeGreaterThanOrEqual(11);
    expect(height).toBeLessThanOrEqual(14);
    expect(length).toBeGreaterThan(span);
    expect(span / length).toBeCloseTo(35.8 / 39.5, 1);
    expect(height / length).toBeCloseTo(12.5 / 39.5, 1);
  });

  it('uses an ENU-friendly aircraft convention: +Y forward, +X right wing, +Z up', () => {
    const model = createBoeing737Model();
    const leftWing = objectNamed(model, 'leftWing');
    const rightWing = objectNamed(model, 'rightWing');
    const leftFlap = objectNamed(model, 'leftFlap');
    const rightFlap = objectNamed(model, 'rightFlap');
    const leftAileron = objectNamed(model, 'leftAileron');
    const rightAileron = objectNamed(model, 'rightAileron');
    const cockpitWindows = objectNamed(model, 'cockpitWindows');
    const noseGear = objectNamed(model, 'noseGear');
    const leftMainGear = objectNamed(model, 'leftMainGear');
    const rightMainGear = objectNamed(model, 'rightMainGear');
    const verticalStabilizer = objectNamed(model, 'verticalStabilizer');
    const rudder = objectNamed(model, 'rudder');
    const leftNavLight = objectNamed(model, 'leftNavLight');
    const rightNavLight = objectNamed(model, 'rightNavLight');
    const tailNavLight = objectNamed(model, 'tailNavLight');

    expect(centerOf(cockpitWindows).y).toBeGreaterThan(0);
    expect(noseGear.position.y).toBeGreaterThan(0);
    expect(leftMainGear.position.y).toBeLessThan(noseGear.position.y);
    expect(rightMainGear.position.y).toBeLessThan(noseGear.position.y);
    expect(centerOf(tailNavLight).y).toBeLessThan(0);

    expect(centerOf(leftWing).x).toBeLessThan(0);
    expect(centerOf(rightWing).x).toBeGreaterThan(0);
    expect(centerOf(leftFlap).x).toBeLessThan(0);
    expect(centerOf(rightFlap).x).toBeGreaterThan(0);
    expect(centerOf(leftAileron).x).toBeLessThan(0);
    expect(centerOf(rightAileron).x).toBeGreaterThan(0);
    expect(leftNavLight.position.x).toBeLessThan(0);
    expect(rightNavLight.position.x).toBeGreaterThan(0);

    expect(noseGear.position.z).toBeLessThan(0);
    expect(leftMainGear.position.z).toBeLessThan(0);
    expect(rightMainGear.position.z).toBeLessThan(0);
    expect(verticalStabilizer.position.z).toBeGreaterThan(0);
    expect(rudder.position.z).toBeGreaterThan(0);
  });

  it('aligns engine nacelles and fan discs with the +Y forward axis', () => {
    const model = createBoeing737Model();
    const leftEngine = objectNamed(model, 'leftEngine');
    const rightEngine = objectNamed(model, 'rightEngine');
    const leftFan = objectNamed(model, 'leftFan');
    const rightFan = objectNamed(model, 'rightFan');

    expect(leftFan.parent?.name).toBe('leftEngine');
    expect(rightFan.parent?.name).toBe('rightEngine');
    expect(sizeOf(leftEngine).y).toBeGreaterThan(sizeOf(leftEngine).z);
    expect(sizeOf(rightEngine).y).toBeGreaterThan(sizeOf(rightEngine).z);
    expect(sizeOf(leftFan).y).toBeLessThan(sizeOf(leftFan).x / 4);
    expect(sizeOf(rightFan).y).toBeLessThan(sizeOf(rightFan).x / 4);
  });

  it('places movable surfaces on plausible hinge lines instead of merging them into the wing or tail', () => {
    const model = createBoeing737Model();
    const leftWing = objectNamed(model, 'leftWing');
    const rightWing = objectNamed(model, 'rightWing');
    const horizontalStabilizer = objectNamed(model, 'horizontalStabilizer');
    const verticalStabilizer = objectNamed(model, 'verticalStabilizer');
    const leftFlap = objectNamed(model, 'leftFlap');
    const rightFlap = objectNamed(model, 'rightFlap');
    const leftAileron = objectNamed(model, 'leftAileron');
    const rightAileron = objectNamed(model, 'rightAileron');
    const leftElevator = objectNamed(model, 'leftElevator');
    const rightElevator = objectNamed(model, 'rightElevator');
    const rudder = objectNamed(model, 'rudder');

    expect(leftFlap.position.y).toBeLessThan(leftWing.position.y);
    expect(rightFlap.position.y).toBeLessThan(rightWing.position.y);
    expect(leftAileron.position.y).toBeLessThan(leftWing.position.y);
    expect(rightAileron.position.y).toBeLessThan(rightWing.position.y);

    expect(leftElevator.position.y).toBeLessThan(horizontalStabilizer.position.y);
    expect(rightElevator.position.y).toBeLessThan(horizontalStabilizer.position.y);
    expect(rudder.position.y).toBeLessThan(verticalStabilizer.position.y - 1);
    expect(rudder.position.z).toBeGreaterThan(verticalStabilizer.position.z);
  });
});
