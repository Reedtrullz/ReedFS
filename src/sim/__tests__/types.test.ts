import { describe, it, expect } from 'vitest';
import { createB737GearStations, createInitialState, B737_800_SPEC } from '../types';
import { quatToEuler } from '../physics/quaternion';
import { B737_800_FDM } from '../data/aircraft/b737-800-fdm.v1';

describe('createInitialState', () => {
  it('returns parked at ENVA with full fuel', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.position.lat).toBeCloseTo(63.45767);
    expect(s.position.lon).toBeCloseTo(10.88648);
    expect(s.flightPhase).toBe('PARKED');
    expect(s.fuel.totalFuel).toBe(B737_800_SPEC.maxFuel);
    expect(s.engines[0].running).toBe(false);
  });

  it('body velocity starts at zero', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.velocity.u).toBe(0);
    expect(s.velocity.v).toBe(0);
    expect(s.velocity.w).toBe(0);
  });

  it('angular velocity starts at zero', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.angularVel.p).toBe(0);
    expect(s.angularVel.q).toBe(0);
    expect(s.angularVel.r).toBe(0);
  });

  it('initial quaternion matches the initial Euler attitude', () => {
    const s = createInitialState(B737_800_SPEC);
    const euler = quatToEuler(s.quaternion);

    expect(euler.phi).toBeCloseTo(s.attitude.phi, 8);
    expect(euler.theta).toBeCloseTo(s.attitude.theta, 8);
    expect(euler.psi).toBeCloseTo(s.attitude.psi, 8);
  });
});

describe('createB737GearStations', () => {
  it('initializes runtime gear station state from the B737 FDM gear-station data', () => {
    const stations = createB737GearStations(100_000, true);

    expect(stations.map((station) => station.id)).toEqual(B737_800_FDM.gearStations.map((station) => station.id));
    expect(stations[0].positionBodyM).toEqual(B737_800_FDM.gearStations[0].positionBodyM);
    expect(stations.map((station) => station.normalForceN)).toEqual([10_000, 45_000, 45_000]);
    expect(stations.every((station) => station.weightOnWheel)).toBe(true);
    expect(stations.every((station) => station.compressionM > 0)).toBe(true);
    expect(stations.every((station) => station.steeringAngleRad === 0)).toBe(true);
  });
});
