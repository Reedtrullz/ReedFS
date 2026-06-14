import { describe, expect, it, vi } from 'vitest';
import { checkGPWS, updateGPWS } from '../GPWS';
import {
  B737_800_SPEC,
  createInitialState,
  type AircraftConfig,
  type AircraftState,
  type Attitude,
  type BodyVelocity,
  type GeoPosition,
  type GroundState,
} from '../../sim/types';

type GpwsStateOverrides = Omit<Partial<AircraftState>, 'position' | 'velocity' | 'attitude' | 'config' | 'ground'> & {
  position?: Partial<GeoPosition>;
  velocity?: Partial<BodyVelocity>;
  attitude?: Partial<Attitude>;
  config?: Partial<AircraftConfig>;
  ground?: Partial<GroundState>;
};

function gpwsState(overrides: GpwsStateOverrides = {}): AircraftState {
  const state = createInitialState(B737_800_SPEC);
  return {
    ...state,
    ...overrides,
    position: { ...state.position, ...overrides.position },
    velocity: { ...state.velocity, ...overrides.velocity },
    attitude: { ...state.attitude, ...overrides.attitude },
    config: { ...state.config, ...overrides.config },
    ground: { ...state.ground, ...overrides.ground },
  };
}

describe('GPWS', () => {
  it('uses AGL instead of MSL altitude for terrain/descent alerts near elevated terrain', () => {
    const state = gpwsState({
      position: { lat: 0, lon: 0, alt: 5_600 },
      ground: { aglFt: 600, groundAltFt: 5_000, weightOnWheels: false },
      velocity: { u: 90, v: 0, w: 16 },
      flightPhase: 'DESCENT',
    });

    expect(checkGPWS(state)).toBe('PULL UP');
  });

  it('does not fire sink-rate modes while the aircraft is climbing away from the ground', () => {
    const state = gpwsState({
      position: { lat: 0, lon: 0, alt: 400 },
      ground: { aglFt: 400, groundAltFt: 0, weightOnWheels: false },
      velocity: { u: 95, v: 0, w: -18 },
      flightPhase: 'CLIMB',
    });

    expect(checkGPWS(state)).toBeNull();
  });

  it('uses AGL for unsafe gear/flap configuration warnings at high-elevation airports', () => {
    const state = gpwsState({
      position: { lat: 0, lon: 0, alt: 5_180 },
      ground: { aglFt: 180, groundAltFt: 5_000, weightOnWheels: false },
      velocity: { u: 80, v: 0, w: 0 },
      config: { gearDown: false, flapSetting: 30 },
      flightPhase: 'APPROACH',
    });

    expect(checkGPWS(state)).toBe('TOO LOW GEAR');
  });

  it('does not call dont-sink during a positive-rate takeoff climb', () => {
    const state = gpwsState({
      position: { lat: 0, lon: 0, alt: 80 },
      ground: { aglFt: 80, groundAltFt: 0, weightOnWheels: false },
      velocity: { u: 85, v: 0, w: -4 },
      flightPhase: 'TAKEOFF',
    });

    expect(checkGPWS(state)).toBeNull();
  });

  it('emits caption events for GPWS callouts even when speech audio is unavailable', () => {
    const state = gpwsState({
      position: { lat: 0, lon: 0, alt: 600 },
      ground: { aglFt: 600, groundAltFt: 0, weightOnWheels: false },
      velocity: { u: 90, v: 0, w: 16 },
      flightPhase: 'DESCENT',
    });
    const onCaption = vi.fn();

    updateGPWS(state, {
      nowMs: 4_000,
      captionsEnabled: true,
      speechEnabled: false,
      onCaption,
    });

    expect(onCaption).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'gpws',
      text: 'PULL UP',
      timestampMs: 4_000,
    }));
  });

  it('does not consume a callout while both speech and captions are disabled', () => {
    const state = gpwsState({
      position: { lat: 0, lon: 0, alt: 180 },
      ground: { aglFt: 180, groundAltFt: 0, weightOnWheels: false },
      velocity: { u: 80, v: 0, w: 0 },
      config: { gearDown: false, flapSetting: 30 },
      flightPhase: 'APPROACH',
    });
    const onCaption = vi.fn();

    updateGPWS(state, {
      nowMs: 8_000,
      captionsEnabled: false,
      speechEnabled: false,
      onCaption,
    });
    updateGPWS(state, {
      nowMs: 12_000,
      captionsEnabled: true,
      speechEnabled: false,
      onCaption,
    });

    expect(onCaption).toHaveBeenCalledTimes(1);
    expect(onCaption).toHaveBeenCalledWith(expect.objectContaining({ text: 'TOO LOW GEAR' }));
  });
});
