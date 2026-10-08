import { describe, expect, it } from 'vitest';
import { B737_800_FDM } from '../../data/aircraft/b737-800-fdm.v1';
import { B737_800_SPEC, createInitialState, type ControlInputs } from '../../types';
import { isControlInputs } from '../../simulationValidation';
import { isaAtAltitude } from '../../physics/atmosphere';
import { integrate } from '../../physics/integrate';
import { computeEngineThrustN, updateEngines } from '../engine';

const idle: ControlInputs = { elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0, flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 0 };

function runningState(altitudeFt = 0) {
  const state = createInitialState(B737_800_SPEC);
  state.position.alt = altitudeFt;
  for (const engine of state.engines) Object.assign(engine, { n1: 80, n2: 90, running: true });
  return state;
}

describe('engine operating boundary', () => {
  it('settles a running engine at fuel-burning idle rather than shutting it down', () => {
    const state = runningState();
    for (let i = 0; i < 600; i++) updateEngines(state, idle, B737_800_SPEC, 0.1);
    for (const engine of state.engines) {
      expect(engine.n1).toBeCloseTo(B737_800_FDM.engine.idleN1Percent, 3);
      expect(engine.n2).toBeCloseTo(B737_800_FDM.engine.idleN2Percent, 3);
      expect(engine.running).toBe(true);
      expect(engine.thrust).toBeGreaterThan(0);
      expect(engine.fuelFlow).toBeGreaterThan(0);
    }
  });

  it('explicit cutoff immediately stops combustion independently of throttle and the other engine', () => {
    const state = runningState();
    const controls = { ...idle, throttle1: 1, fuelCutoff1: true, fuelCutoff2: false };
    updateEngines(state, controls, B737_800_SPEC, 1);
    expect(state.engines[0]).toMatchObject({ thrust: 0, fuelFlow: 0, running: false });
    expect(state.engines[0].n1).toBeLessThan(80);
    expect(state.engines[1].thrust).toBeGreaterThan(0);
    expect(state.engines[1].running).toBe(true);
    for (let i = 0; i < 400; i++) updateEngines(state, controls, B737_800_SPEC, 0.1);
    expect(state.engines[0].n1).toBeLessThan(0.01);
    expect(state.engines[1].n1).toBeCloseTo(B737_800_FDM.engine.idleN1Percent, 3);
    expect(state.fuel.fuelFlowTotal).toBe(state.engines[1].fuelFlow);
  });

  it.each([0, 10_000])('uses the same weather temperature and pressure for engine Mach and relative density at %sft', (altitudeFt) => {
    const samples = [-5, 15, 35].map((surfaceTemperatureC) => {
      const state = runningState(altitudeFt);
      state.velocity = { u: 150, v: 0, w: 0 };
      const weather = { qnhHpa: 1013.25, surfaceTemperatureC };
      updateEngines(state, idle, B737_800_SPEC, 0, null, weather);
      const standard = isaAtAltitude(altitudeFt);
      const localTempK = standard.tempK + surfaceTemperatureC - 15;
      const expectedMach = 150 / Math.sqrt(1.4 * 287.058 * localTempK);
      const expected = computeEngineThrustN(80, B737_800_SPEC, altitudeFt, expectedMach) * standard.tempK / localTempK;
      expect(state.engines[0].thrust).toBeCloseTo(expected, 6);
      return state.engines[0].thrust;
    });
    expect(samples[0]).toBeGreaterThan(samples[1]);
    expect(samples[1]).toBeGreaterThan(samples[2]);
  });

  it('passes effective weather through the integrator and cools a cutoff engine to local ambient', () => {
    const state = runningState(10_000);
    state.velocity = { u: 150, v: 0, w: 0 };
    const controls = { ...idle, fuelCutoff2: true };
    const weather = { qnhHpa: 950, surfaceTemperatureC: 35 };
    const expected = structuredClone(state);
    updateEngines(expected, controls, B737_800_SPEC, 0, null, weather);
    integrate(state, controls, B737_800_SPEC, 0, null, weather);
    expect(state.engines).toEqual(expected.engines);
    expect(state.engines[1].egt).toBeCloseTo(isaAtAltitude(10_000).tempC + 20, 8);
  });

  it('rejects nonboolean cutoff fields at the worker/save boundary while accepting legacy controls', () => {
    expect(isControlInputs(idle)).toBe(true);
    expect(isControlInputs({ ...idle, fuelCutoff1: true, fuelCutoff2: false })).toBe(true);
    for (const invalid of [1, 'true', null]) expect(isControlInputs({ ...idle, fuelCutoff1: invalid })).toBe(false);
  });
});
