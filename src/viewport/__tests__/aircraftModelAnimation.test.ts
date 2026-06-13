import { describe, expect, it } from 'vitest';
import { createBoeing737Model } from '../AircraftModel';
import { createAircraftModelQuaternion } from '../aircraftOrientation';
import { applyAircraftModelAnimations } from '../aircraftModelAnimation';
import { B737_800_SPEC, createInitialState, type AircraftState, type ControlInputs } from '../../sim/types';

function aircraftForAnimation(overrides: Partial<AircraftState> = {}): AircraftState {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.engines[0].n1 = 100;
  aircraft.engines[1].n1 = 80;
  aircraft.electrical.batteryVolts = 28;
  aircraft.simTime = 3000;

  return {
    ...aircraft,
    ...overrides,
  };
}

function controls(overrides: Partial<ControlInputs> = {}): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0,
    throttle2: 0,
    flapLever: 0,
    gearLever: 'DOWN',
    spoilers: 0,
    brake: 0,
    ...overrides,
  };
}

describe('aircraft model animations', () => {
  it('spins fan discs without rotating the aircraft root or static engine nacelles', () => {
    const model = createBoeing737Model();
    const expectedQuaternion = createAircraftModelQuaternion({ phi: 0, theta: 0, psi: Math.PI });
    model.quaternion.copy(expectedQuaternion);

    applyAircraftModelAnimations(model, aircraftForAnimation(), controls());

    expect(model.quaternion.angleTo(expectedQuaternion)).toBeLessThan(1e-9);
    expect(Math.abs(model.rotation.z)).toBeCloseTo(Math.PI, 9);
    expect(model.getObjectByName('leftEngine')?.rotation.y).toBeCloseTo(0, 9);
    expect(model.getObjectByName('rightEngine')?.rotation.y).toBeCloseTo(0, 9);
    expect(model.getObjectByName('leftFan')?.rotation.y).not.toBe(0);
    expect(model.getObjectByName('rightFan')?.rotation.y).not.toBe(0);
  });

  it('compresses landing gear along the model down/up axis only', () => {
    const model = createBoeing737Model();

    applyAircraftModelAnimations(model, aircraftForAnimation(), controls());

    ['noseGear', 'leftMainGear', 'rightMainGear'].forEach((gearName) => {
      const gear = model.getObjectByName(gearName);
      expect(gear?.visible).toBe(true);
      expect(gear?.scale.z).toBeCloseTo(0.7, 9);
      expect(gear?.scale.x).toBeCloseTo(1, 9);
      expect(gear?.scale.y).toBeCloseTo(1, 9);
      gear?.children.forEach((child) => {
        expect(child.scale.z).toBeCloseTo(1, 9);
      });
    });
  });

  it('hides/retracts gear when actual gear is up', () => {
    const model = createBoeing737Model();
    const retracted = aircraftForAnimation({
      config: { ...createInitialState(B737_800_SPEC).config, gearDown: false, gearPosition: 0 },
    });

    applyAircraftModelAnimations(model, retracted, controls({ gearLever: 'UP' }));

    ['noseGear', 'leftMainGear', 'rightMainGear'].forEach((gearName) => {
      const gear = model.getObjectByName(gearName);
      expect(gear?.visible).toBe(false);
      expect(gear?.scale.z).toBeCloseTo(1, 9);
    });
  });

  it('deflects flaps increasingly with actual flap state', () => {
    const model = createBoeing737Model();
    const aircraft = aircraftForAnimation();

    aircraft.config.flapSetting = 5;
    applyAircraftModelAnimations(model, aircraft, controls({ flapLever: 30 }));
    const flaps5 = model.getObjectByName('leftFlap')?.rotation.x ?? 0;

    aircraft.config.flapSetting = 15;
    applyAircraftModelAnimations(model, aircraft, controls({ flapLever: 30 }));
    const flaps15 = model.getObjectByName('leftFlap')?.rotation.x ?? 0;

    aircraft.config.flapSetting = 30;
    applyAircraftModelAnimations(model, aircraft, controls({ flapLever: 30 }));
    const flaps30 = model.getObjectByName('leftFlap')?.rotation.x ?? 0;

    expect(flaps5).toBeGreaterThan(0);
    expect(flaps15).toBeGreaterThan(flaps5);
    expect(flaps30).toBeGreaterThan(flaps15);
    expect(model.getObjectByName('rightFlap')?.rotation.x).toBeCloseTo(flaps30, 9);
  });

  it('deflects elevator, aileron, and rudder surfaces from effective controls', () => {
    const model = createBoeing737Model();

    applyAircraftModelAnimations(model, aircraftForAnimation(), controls({
      aileron: 1,
      elevator: -0.5,
      rudder: 1,
    }));

    expect(model.getObjectByName('leftAileron')?.rotation.x).toBeGreaterThan(0);
    expect(model.getObjectByName('rightAileron')?.rotation.x).toBeLessThan(0);
    expect(model.getObjectByName('leftElevator')?.rotation.x).toBeLessThan(0);
    expect(model.getObjectByName('rightElevator')?.rotation.x).toBeLessThan(0);
    expect(model.getObjectByName('rudder')?.rotation.z).toBeGreaterThan(0);
  });

  it('toggles lights deterministically for tests', () => {
    const model = createBoeing737Model();
    const aircraft = aircraftForAnimation({ simTime: 0 });

    applyAircraftModelAnimations(model, aircraft, controls({ gearLever: 'DOWN' }));
    expect(model.getObjectByName('leftNavLight')?.visible).toBe(true);
    expect(model.getObjectByName('rightNavLight')?.visible).toBe(true);
    expect(model.getObjectByName('tailNavLight')?.visible).toBe(true);
    expect(model.getObjectByName('landingLight')?.visible).toBe(true);
    expect(model.getObjectByName('beacon')?.visible).toBe(true);

    applyAircraftModelAnimations(model, aircraftForAnimation({ simTime: 750 }), controls({ gearLever: 'DOWN' }));
    expect(model.getObjectByName('beacon')?.visible).toBe(false);

    const unpowered = aircraftForAnimation({
      electrical: { ...aircraft.electrical, batteryVolts: 0, acBusPowered: false },
    });
    applyAircraftModelAnimations(model, unpowered, controls({ gearLever: 'DOWN' }));
    expect(model.getObjectByName('leftNavLight')?.visible).toBe(false);
    expect(model.getObjectByName('landingLight')?.visible).toBe(false);
  });
});
