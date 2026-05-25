import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Attitude } from '../../sim/types';
import { createAircraftModelQuaternion } from '../aircraftOrientation';

function axisAfterRotation(attitude: Attitude, axis: Vector3): Vector3 {
  return axis.clone().applyQuaternion(createAircraftModelQuaternion(attitude));
}

function expectVectorClose(actual: Vector3, expected: Vector3): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
}

describe('createAircraftModelQuaternion', () => {
  it('maps ENU-model fuselage forward axis to ENU north at zero heading', () => {
    const attitude = { phi: 0, theta: 0, psi: 0 };

    expectVectorClose(axisAfterRotation(attitude, new Vector3(0, 1, 0)), new Vector3(0, 1, 0));
    expectVectorClose(axisAfterRotation(attitude, new Vector3(1, 0, 0)), new Vector3(1, 0, 0));
    expectVectorClose(axisAfterRotation(attitude, new Vector3(0, 0, 1)), new Vector3(0, 0, 1));
  });

  it('maps ENU-model fuselage forward axis to ENU south at KSEA runway heading', () => {
    const attitude = { phi: 0, theta: 0, psi: Math.PI };

    expectVectorClose(axisAfterRotation(attitude, new Vector3(0, 1, 0)), new Vector3(0, -1, 0));
    expectVectorClose(axisAfterRotation(attitude, new Vector3(1, 0, 0)), new Vector3(-1, 0, 0));
    expectVectorClose(axisAfterRotation(attitude, new Vector3(0, 0, 1)), new Vector3(0, 0, 1));
  });

  it('uses pitch as a moderate nose-up component, not as vertical rocket alignment', () => {
    const attitude = { phi: 0, theta: 15 * Math.PI / 180, psi: Math.PI };
    const forward = axisAfterRotation(attitude, new Vector3(0, 1, 0));

    expect(forward.z).toBeCloseTo(Math.sin(15 * Math.PI / 180), 6);
    expect(forward.z).toBeLessThan(0.3);
    expect(forward.y).toBeLessThan(-0.9);
  });
});
