import { describe, expect, it } from 'vitest';
import { createBoeing737Model } from '../AircraftModel';

describe('createBoeing737Model', () => {
  it('uses an ENU-friendly aircraft convention: +Y forward, +X right, +Z up', () => {
    const model = createBoeing737Model();
    const wing = model.getObjectByName('mainWing');
    const noseGear = model.getObjectByName('noseGear');
    const leftMainGear = model.getObjectByName('leftMainGear');
    const rightMainGear = model.getObjectByName('rightMainGear');
    const verticalStabilizer = model.getObjectByName('verticalStabilizer');

    expect(wing?.scale.z ?? 1).toBe(1);
    expect(noseGear?.position.y).toBeGreaterThan(0);
    expect(leftMainGear?.position.y).toBeLessThan(noseGear?.position.y ?? 0);
    expect(rightMainGear?.position.y).toBeLessThan(noseGear?.position.y ?? 0);
    expect(noseGear?.position.z).toBeLessThan(0);
    expect(leftMainGear?.position.z).toBeLessThan(0);
    expect(rightMainGear?.position.z).toBeLessThan(0);
    expect(verticalStabilizer?.position.z).toBeGreaterThan(0);
  });
});
