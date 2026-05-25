import { describe, expect, it } from 'vitest';
import { followCameraHeading } from '../cameraFollow';

describe('followCameraHeading', () => {
  it('uses the aircraft heading directly so chase view sits behind the airplane', () => {
    expect(followCameraHeading(0)).toBe(0);
    expect(followCameraHeading(Math.PI)).toBe(Math.PI);
    expect(followCameraHeading(Math.PI / 2)).toBe(Math.PI / 2);
  });
});
