import { describe, expect, it } from 'vitest';
import { createBoeing737Model } from '../AircraftModel';

describe('createBoeing737Model', () => {
  it('uses Three.js aircraft convention with nose forward on negative Z', () => {
    const model = createBoeing737Model();
    const noseGear = model.getObjectByName('noseGear');
    const leftMainGear = model.getObjectByName('leftMainGear');
    const rightMainGear = model.getObjectByName('rightMainGear');

    expect(noseGear?.position.z).toBeLessThan(0);
    expect(leftMainGear?.position.z).toBeGreaterThan(0);
    expect(rightMainGear?.position.z).toBeGreaterThan(0);
  });
});
