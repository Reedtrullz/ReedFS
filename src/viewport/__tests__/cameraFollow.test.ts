import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { chaseCameraOffset, headingForwardEnu } from '../cameraFollow';
import { createAircraftModelQuaternion } from '../aircraftOrientation';
import type { Attitude } from '../../sim/types';

function offsetVector(attitude: Attitude, range = 300, lookDownRad = 15 * Math.PI / 180): Vector3 {
  const offset = chaseCameraOffset(attitude, range, lookDownRad);
  return new Vector3(offset.east, offset.north, offset.up);
}

function modelNoseVector(attitude: Attitude): Vector3 {
  return new Vector3(0, 1, 0).applyQuaternion(createAircraftModelQuaternion(attitude));
}

function horizontal(v: Vector3): Vector3 {
  return new Vector3(v.x, v.y, 0).normalize();
}

describe('chaseCameraOffset', () => {
  it('places the chase camera south of a northbound aircraft', () => {
    const offset = chaseCameraOffset({ psi: 0 }, 300, 15 * Math.PI / 180);

    expect(offset.east).toBeCloseTo(0, 6);
    expect(offset.north).toBeCloseTo(-300 * Math.cos(15 * Math.PI / 180), 6);
    expect(offset.up).toBeCloseTo(300 * Math.sin(15 * Math.PI / 180), 6);
  });

  it('places the chase camera north of the KSEA southbound runway heading', () => {
    const offset = chaseCameraOffset({ psi: Math.PI }, 300, 15 * Math.PI / 180);

    expect(offset.east).toBeCloseTo(0, 6);
    expect(offset.north).toBeCloseTo(300 * Math.cos(15 * Math.PI / 180), 6);
    expect(offset.up).toBeCloseTo(300 * Math.sin(15 * Math.PI / 180), 6);
  });

  it('stays behind the rendered model nose instead of off either wing', () => {
    const attitudes: Attitude[] = [
      { phi: 0, theta: 0, psi: 0 },
      { phi: 0, theta: 0, psi: Math.PI / 2 },
      { phi: 0, theta: 0, psi: Math.PI },
      { phi: 0, theta: 0, psi: -Math.PI / 2 },
    ];

    for (const attitude of attitudes) {
      const camera = horizontal(offsetVector(attitude));
      const nose = horizontal(modelNoseVector(attitude));
      const rightWing = horizontal(new Vector3(1, 0, 0).applyQuaternion(createAircraftModelQuaternion(attitude)));

      expect(camera.dot(nose)).toBeCloseTo(-1, 6);
      expect(camera.dot(rightWing)).toBeCloseTo(0, 6);
    }
  });

  it('uses RFS heading convention: 90 degrees points east', () => {
    expect(headingForwardEnu(Math.PI / 2).east).toBeCloseTo(1, 6);
    expect(headingForwardEnu(Math.PI / 2).north).toBeCloseTo(0, 6);
  });
});
