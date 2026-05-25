import { describe, expect, it } from 'vitest';
import { createBoeing737Model } from '../AircraftModel';
import { createAircraftModelQuaternion } from '../aircraftOrientation';
import { applyAircraftModelAnimations } from '../aircraftModelAnimation';
import type { AircraftState } from '../../sim/types';

function aircraftForAnimation(overrides: Partial<AircraftState> = {}): Pick<AircraftState, 'engines' | 'simTime' | 'position' | 'config'> {
  return {
    engines: [
      { n1: 1, egt: 0, fuelFlow: 0 },
      { n1: 0.8, egt: 0, fuelFlow: 0 },
    ],
    simTime: 3,
    position: { lat: 47.45, lon: -122.31, alt: 0 },
    config: { flaps: 5, gearDown: true, speedbrake: 0 },
    ...overrides,
  } as Pick<AircraftState, 'engines' | 'simTime' | 'position' | 'config'>;
}

describe('aircraft model animations', () => {
  it('spins engine meshes without rotating the aircraft root', () => {
    const model = createBoeing737Model();
    const expectedQuaternion = createAircraftModelQuaternion({ phi: 0, theta: 0, psi: Math.PI });
    model.quaternion.copy(expectedQuaternion);

    applyAircraftModelAnimations(model, aircraftForAnimation());

    expect(model.quaternion.angleTo(expectedQuaternion)).toBeLessThan(1e-9);
    expect(Math.abs(model.rotation.z)).toBeCloseTo(Math.PI, 9);
    expect(model.getObjectByName('leftEngine')?.rotation.y).not.toBe(0);
    expect(model.getObjectByName('rightEngine')?.rotation.y).not.toBe(0);
  });

  it('compresses landing gear along the model down/up axis only', () => {
    const model = createBoeing737Model();

    applyAircraftModelAnimations(model, aircraftForAnimation());

    const noseGear = model.getObjectByName('noseGear');
    expect(noseGear?.scale.z).toBeCloseTo(0.7, 9);
    expect(noseGear?.scale.x).toBeCloseTo(1, 9);
    expect(noseGear?.scale.y).toBeCloseTo(1, 9);
  });

  it('leaves gear uncompressed when airborne or retracted', () => {
    const model = createBoeing737Model();

    applyAircraftModelAnimations(model, aircraftForAnimation({
      position: { lat: 47.45, lon: -122.31, alt: 1000 },
    }));

    expect(model.getObjectByName('noseGear')?.scale.z).toBeCloseTo(1, 9);
  });
});
