import { describe, expect, it } from 'vitest';
import { createBoeing737Model } from '../AircraftModel';
import { createAircraftModelQuaternion } from '../aircraftOrientation';
import { applyAircraftModelAnimations } from '../aircraftModelAnimation';
import { B737_800_SPEC, createInitialState, type AircraftState } from '../../sim/types';

function aircraftForAnimation(overrides: Partial<AircraftState> = {}): Pick<AircraftState, 'engines' | 'simTime' | 'ground' | 'config'> {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.engines[0].n1 = 1;
  aircraft.engines[1].n1 = 0.8;
  aircraft.simTime = 3;

  return {
    engines: aircraft.engines,
    simTime: aircraft.simTime,
    ground: aircraft.ground,
    config: aircraft.config,
    ...overrides,
  };
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

    const airborne = createInitialState(B737_800_SPEC);
    airborne.ground = {
      ...airborne.ground,
      aglFt: 1000,
      weightOnWheels: false,
      normalForceN: 0,
      onRunway: false,
      contact: 'none',
    };

    applyAircraftModelAnimations(model, aircraftForAnimation({ ground: airborne.ground }));

    expect(model.getObjectByName('noseGear')?.scale.z).toBeCloseTo(1, 9);

    const retracted = createInitialState(B737_800_SPEC);
    retracted.config.gearDown = false;
    applyAircraftModelAnimations(model, aircraftForAnimation({ config: retracted.config }));

    expect(model.getObjectByName('noseGear')?.scale.z).toBeCloseTo(1, 9);
  });
});
