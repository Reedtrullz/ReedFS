import { describe, expect, it } from 'vitest';
import { createAircraftVisualState } from '../aircraftVisualState';
import { B737_800_SPEC, createInitialState, type AircraftState, type ControlInputs } from '../../sim/types';

function aircraft(overrides: Partial<AircraftState> = {}): AircraftState {
  const state = createInitialState(B737_800_SPEC);
  state.engines[0].n1 = 50;
  state.engines[1].n1 = 25;
  state.electrical.batteryVolts = 28;
  state.simTime = 2000;
  return { ...state, ...overrides };
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

describe('createAircraftVisualState', () => {
  it('derives gear extension and compression from effective gear state and WOW/AGL', () => {
    const onGround = createAircraftVisualState(aircraft(), controls({ gearLever: 'DOWN' }));
    expect(onGround.gear.visible).toBe(true);
    expect(onGround.gear.compressionScaleZ).toBeCloseTo(0.7, 9);

    const airborne = aircraft({
      ground: { ...aircraft().ground, aglFt: 500, weightOnWheels: false, normalForceN: 0, contact: 'none' },
    });
    expect(createAircraftVisualState(airborne, controls({ gearLever: 'DOWN' })).gear.compressionScaleZ).toBe(1);

    const retracted = aircraft({ config: { ...aircraft().config, gearDown: false } });
    expect(createAircraftVisualState(retracted, controls({ gearLever: 'UP' })).gear.visible).toBe(false);

    const transitioning = aircraft({ config: { ...aircraft().config, gearDown: false, gearPosition: 0.4 } });
    const transitionVisual = createAircraftVisualState(transitioning, controls({ gearLever: 'UP' }));
    expect(transitionVisual.gear.visible).toBe(true);
    expect(transitionVisual.gear.extensionFraction).toBeCloseTo(0.4, 9);
    expect(transitionVisual.gear.compressionScaleZ).toBe(1);
  });

  it('maps actual flap state to increasing downward flap deflection without snapping to command', () => {
    const flaps5Aircraft = aircraft({ config: { ...aircraft().config, flapSetting: 5 } });
    const flaps15Aircraft = aircraft({ config: { ...aircraft().config, flapSetting: 15 } });
    const flaps30Aircraft = aircraft({ config: { ...aircraft().config, flapSetting: 30 } });
    const flaps5 = createAircraftVisualState(flaps5Aircraft, controls({ flapLever: 30 })).flaps.deflectionRad;
    const flaps15 = createAircraftVisualState(flaps15Aircraft, controls({ flapLever: 30 })).flaps.deflectionRad;
    const flaps30 = createAircraftVisualState(flaps30Aircraft, controls({ flapLever: 30 })).flaps.deflectionRad;
    const commanded30FromActual5 = createAircraftVisualState(flaps5Aircraft, controls({ flapLever: 30 })).flaps.deflectionRad;

    expect(flaps5).toBeGreaterThan(0);
    expect(flaps15).toBeGreaterThan(flaps5);
    expect(flaps30).toBeGreaterThan(flaps15);
    expect(commanded30FromActual5).toBe(flaps5);
  });

  it('maps effective controls to differential surfaces with correct signs', () => {
    const visual = createAircraftVisualState(aircraft(), controls({
      aileron: 1,
      elevator: -0.5,
      rudder: 1,
    }));

    expect(visual.controls.leftAileronRad).toBeGreaterThan(0);
    expect(visual.controls.rightAileronRad).toBeLessThan(0);
    expect(visual.controls.leftElevatorRad).toBeLessThan(0);
    expect(visual.controls.rightElevatorRad).toBeLessThan(0);
    expect(visual.controls.rudderRad).toBeGreaterThan(0);
  });

  it('uses sim time and N1 to rotate fan discs only', () => {
    const visual = createAircraftVisualState(aircraft(), controls());

    expect(visual.fans.leftRotationRad).toBeCloseTo(2 * 0.5 * 40, 8);
    expect(visual.fans.rightRotationRad).toBeCloseTo(2 * 0.25 * 40, 8);
  });

  it('derives deterministic powered lighting and beacon strobe state', () => {
    const beaconOn = createAircraftVisualState(aircraft({ simTime: 0 }), controls()).lights.beaconVisible;
    const beaconOff = createAircraftVisualState(aircraft({ simTime: 750 }), controls()).lights.beaconVisible;
    expect(beaconOn).toBe(true);
    expect(beaconOff).toBe(false);

    const unpowered = aircraft({ electrical: { ...aircraft().electrical, batteryVolts: 0, acBusPowered: false } });
    const lights = createAircraftVisualState(unpowered, controls()).lights;
    expect(lights.navVisible).toBe(false);
    expect(lights.landingVisible).toBe(false);
  });
});
