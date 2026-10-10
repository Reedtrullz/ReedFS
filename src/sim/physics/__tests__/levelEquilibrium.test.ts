import { describe, expect, it } from 'vitest';
import {
  LEVEL_EQUILIBRIUM_TOLERANCES,
  solveLevelEquilibrium,
  type LevelEquilibriumRequest,
} from '../levelEquilibrium';
import { B737_800_SPEC, createInitialState, type AircraftState } from '../../types';
import { computeAero } from '../aero';
import { integrate } from '../integrate';
import { updateEngines } from '../../systems/engine';
import type { WindInfo } from '../../weather';
import { KPDX_RUNWAY_10R } from '../../../viewport/runwayData';

const CALM_WIND: WindInfo = { dir: 0, speed: 0 };
const CLEAR_WEATHER = { qnhHpa: 1013.25, surfaceTemperatureC: 15 };
const PRESET_TARGET_TAS_KT = 220;
const PRESET_ALTITUDE_FT = 10_000;
const MEDIUM_GROSS_WEIGHT_KG = 61_913;
const MEDIUM_CG_PERCENT = 25;
const DRIFT_ALTITUDE_FT = 10;
const DRIFT_TAS_KT = 1;
const DRIFT_PITCH_DEG = 0.2;
const DRIFT_LATERAL_MS = 0.05;
const DRIFT_DURATION_S = 10;
const DRIFT_ROLL_RATE_RAD_S = 0.0035;
const DRIFT_YAW_RATE_RAD_S = 0.0035;

function requestForTarget(
  targetTasKt: number,
  altitudeFt: number,
  grossWeightKg: number,
  cgPercent: number,
  weather: { qnhHpa: number; surfaceTemperatureC: number } = CLEAR_WEATHER,
): LevelEquilibriumRequest {
  return {
    targetTasKt,
    altitudeFt,
    weather,
    spec: B737_800_SPEC,
    grossWeightKg,
    cgPercent,
    fuel: { centerTank: 4_000, leftTank: 2_000, rightTank: 2_000 },
  };
}

function mediumRequest(overrides: Partial<LevelEquilibriumRequest> = {}): LevelEquilibriumRequest {
  return {
    ...requestForTarget(PRESET_TARGET_TAS_KT, PRESET_ALTITUDE_FT, MEDIUM_GROSS_WEIGHT_KG, MEDIUM_CG_PERCENT),
    ...overrides,
  };
}

function stateOverRunwayAt(altitudeFt: number, state: AircraftState): AircraftState {
  state.position.lat = KPDX_RUNWAY_10R.start.lat;
  state.position.lon = KPDX_RUNWAY_10R.start.lon;
  state.ground.groundAltFt = KPDX_RUNWAY_10R.elevationFt;
  state.position.alt = KPDX_RUNWAY_10R.elevationFt + altitudeFt;
  return state;
}

describe('level equilibrium solver contract', () => {
  it('declares numerical tolerances before measurement', () => {
    expect(LEVEL_EQUILIBRIUM_TOLERANCES).toEqual({
      forceN: 0.1,
      momentNm: 0.1,
      maxAngleIterations: 60,
      maxTrimIterations: 50,
      maxThrottleIterations: 50,
      initialDownVelocityMs: 1e-8,
    });
  });

  it('solves the medium 220 kt TAS / 10,000 ft preset with audited residuals', () => {
    const request = mediumRequest();
    const result = solveLevelEquilibrium(request, CALM_WIND);

    expect(result.status).toBe('converged');
    if (result.status !== 'converged') throw new Error('preset must converge');
    expect(result.provenance.solverId).toBe('rfs-level-equilibrium-v1');
    expect(result.provenance.aeroModelId).toBe('b737-800-fdm');
    expect(result.angleIterations).toBeLessThanOrEqual(LEVEL_EQUILIBRIUM_TOLERANCES.maxAngleIterations);
    expect(result.trimIterations).toBeLessThanOrEqual(LEVEL_EQUILIBRIUM_TOLERANCES.maxTrimIterations);
    expect(result.throttleIterations).toBeLessThanOrEqual(LEVEL_EQUILIBRIUM_TOLERANCES.maxThrottleIterations);

    const state = structuredClone(result.aircraft);
    updateEngines(state, result.controls, B737_800_SPEC, 0, CALM_WIND, request.weather);
    const aero = computeAero(state, result.controls, B737_800_SPEC, undefined, CALM_WIND, request.weather);
    const weightN = request.grossWeightKg * 9.80665;
    const theta = state.attitude.theta;
    expect(aero.lift - weightN * Math.cos(theta)).toBeLessThanOrEqual(LEVEL_EQUILIBRIUM_TOLERANCES.forceN);
    expect(aero.thrust + aero.dragBodyX - weightN * Math.sin(theta)).toBeLessThanOrEqual(LEVEL_EQUILIBRIUM_TOLERANCES.forceN);
    expect(Math.abs(aero.pitchMoment)).toBeLessThanOrEqual(LEVEL_EQUILIBRIUM_TOLERANCES.momentNm);
    expect(Math.abs(aero.rollMoment)).toBeLessThanOrEqual(LEVEL_EQUILIBRIUM_TOLERANCES.momentNm);
    expect(Math.abs(aero.yawMoment)).toBeLessThanOrEqual(LEVEL_EQUILIBRIUM_TOLERANCES.momentNm);

    expect(result.aircraft.config.stabilizerTrimUnits).toBeCloseTo(result.controls.trimUnits, 9);
    expect(result.controls.throttle).toBeGreaterThanOrEqual(0);
    expect(result.controls.throttle).toBeLessThanOrEqual(1);
    expect(result.controls.throttle1).toBeCloseTo(result.controls.throttle, 9);
    expect(result.controls.throttle2).toBeCloseTo(result.controls.throttle, 9);
    expect(result.aircraft.config.flapSetting).toBe(0);
    expect(result.aircraft.config.gearDown).toBe(false);
    expect(result.aircraft.config.gearPosition).toBe(0);
    expect(result.aircraft.config.speedBrake).toBe(0);
    expect(result.controls.elevator).toBe(0);
    expect(result.controls.aileron).toBe(0);
    expect(result.controls.rudder).toBe(0);
    expect(result.aircraft.fuel.centerTank).toBe(4_000);
    expect(result.aircraft.fuel.leftTank).toBe(2_000);
    expect(result.aircraft.fuel.rightTank).toBe(2_000);
  });

  it('returns a cloned candidate and leaves the caller-owned input state byte-identical', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = PRESET_ALTITUDE_FT;
    state.grossWeight = MEDIUM_GROSS_WEIGHT_KG;
    state.cg = MEDIUM_CG_PERCENT;
    state.fuel = { totalFuel: 8_000, fuelFlowTotal: 0, centerTank: 4_000, leftTank: 2_000, rightTank: 2_000 };
    const before = JSON.stringify(state);
    const result = solveLevelEquilibrium({ ...mediumRequest(), state }, CALM_WIND);
    expect(result.status).toBe('converged');
    if (result.status !== 'converged') throw new Error('expected convergence');
    expect(result.aircraft).not.toBe(state);
    expect(JSON.stringify(state)).toEqual(before);
  });

  it('refuses a low-energy target as explicitly infeasible with a residual receipt', () => {
    const result = solveLevelEquilibrium(requestForTarget(120, PRESET_ALTITUDE_FT, MEDIUM_GROSS_WEIGHT_KG, MEDIUM_CG_PERCENT), CALM_WIND);
    expect(result.status).toBe('infeasible');
    if (result.status !== 'infeasible') throw new Error('expected infeasible');
    expect(result.reason).toMatch(/lift|normal force|thrust|trim|bracket|infeasible/i);
    expect(result.provenance.solverId).toBe('rfs-level-equilibrium-v1');
  });

  it('refuses an overweight target as infeasible', () => {
    const result = solveLevelEquilibrium(requestForTarget(240, PRESET_ALTITUDE_FT, 100_000, MEDIUM_CG_PERCENT), CALM_WIND);
    expect(result.status).toBe('infeasible');
  });

  it('refuses an unreachable-speed target as infeasible', () => {
    const result = solveLevelEquilibrium(requestForTarget(400, PRESET_ALTITUDE_FT, MEDIUM_GROSS_WEIGHT_KG, MEDIUM_CG_PERCENT), CALM_WIND);
    expect(result.status).toBe('infeasible');
  });

  it('fails closed on nonfinite targets', () => {
    expect(solveLevelEquilibrium(mediumRequest({ targetTasKt: Number.NaN }), CALM_WIND).status).toBe('infeasible');
    expect(solveLevelEquilibrium(mediumRequest({ targetTasKt: Number.POSITIVE_INFINITY }), CALM_WIND).status).toBe('infeasible');
    expect(solveLevelEquilibrium(mediumRequest({ altitudeFt: Number.NaN }), CALM_WIND).status).toBe('infeasible');
    expect(solveLevelEquilibrium(mediumRequest({ grossWeightKg: Number.NaN }), CALM_WIND).status).toBe('infeasible');
    expect(solveLevelEquilibrium(mediumRequest({ cgPercent: Number.NaN }), CALM_WIND).status).toBe('infeasible');
  });

  it('fails closed on invalid mass and geometry', () => {
    expect(solveLevelEquilibrium(mediumRequest({ grossWeightKg: 0 }), CALM_WIND).status).toBe('infeasible');
    expect(solveLevelEquilibrium(mediumRequest({ grossWeightKg: -5_000 }), CALM_WIND).status).toBe('infeasible');
    expect(solveLevelEquilibrium(mediumRequest({ cgPercent: 40 }), CALM_WIND).status).toBe('infeasible');
    expect(solveLevelEquilibrium(mediumRequest({ cgPercent: 3 }), CALM_WIND).status).toBe('infeasible');
  });

  it('fails closed on no fuel or nonpositive tank loads', () => {
    expect(solveLevelEquilibrium(mediumRequest({ fuel: { centerTank: 0, leftTank: 0, rightTank: 0 } }), CALM_WIND).status).toBe('infeasible');
    expect(solveLevelEquilibrium(mediumRequest({ fuel: { centerTank: -100, leftTank: 2_000, rightTank: 2_000 } }), CALM_WIND).status).toBe('infeasible');
  });

  it('fails closed on unsupported wind and gusts', () => {
    expect(solveLevelEquilibrium(mediumRequest(), { dir: 90, speed: 8 }).status).toBe('infeasible');
    expect(solveLevelEquilibrium(mediumRequest(), { dir: 0, speed: 0, gustSpeed: 12 }).status).toBe('infeasible');
  });

  it('supports an effective QNH/temperature weather case and preserves the fuel plan', () => {
    const weather = { qnhHpa: 995, surfaceTemperatureC: -12 };
    const result = solveLevelEquilibrium(requestForTarget(PRESET_TARGET_TAS_KT, PRESET_ALTITUDE_FT, MEDIUM_GROSS_WEIGHT_KG, MEDIUM_CG_PERCENT, weather), CALM_WIND);
    expect(result.status).toBe('converged');
    if (result.status !== 'converged') throw new Error('effective weather case must converge');
    expect(result.aircraft.fuel.centerTank).toBe(4_000);
    expect(result.provenance.weatherQnhHpa).toBeCloseTo(995, 6);
    expect(result.provenance.weatherSurfaceTemperatureC).toBeCloseTo(-12, 6);
  });

  it('preserves positive authored tank loads in the returned candidate', () => {
    const result = solveLevelEquilibrium(mediumRequest({ fuel: { centerTank: 6_000, leftTank: 3_000, rightTank: 3_000 } }), CALM_WIND);
    expect(result.status).toBe('converged');
    if (result.status !== 'converged') throw new Error('expected convergence');
    expect(result.aircraft.fuel.centerTank).toBe(6_000);
    expect(result.aircraft.fuel.leftTank).toBe(3_000);
    expect(result.aircraft.fuel.rightTank).toBe(3_000);
  });

  it('holds the solved state within declared drift thresholds for 10 unassisted seconds', () => {
    const request = mediumRequest();
    const result = solveLevelEquilibrium(request, CALM_WIND);
    expect(result.status).toBe('converged');
    if (result.status !== 'converged') throw new Error('preset must converge');

    const state = structuredClone(result.aircraft);
    stateOverRunwayAt(PRESET_ALTITUDE_FT, state);
    const initialAltFt = state.position.alt;
    const initialTasMs = Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w);
    const initialPitchRad = state.attitude.theta;
    const dtS = DRIFT_DURATION_S / (DRIFT_DURATION_S * 60);
    for (let tick = 0; tick < DRIFT_DURATION_S * 60; tick += 1) {
      integrate(state, result.controls, B737_800_SPEC, dtS, CALM_WIND, request.weather);
    }

    const tasMs = Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w);
    const pitchDeg = Math.abs(state.attitude.theta - initialPitchRad) * 180 / Math.PI;
    expect(initialAltFt - state.position.alt).toBeLessThanOrEqual(DRIFT_ALTITUDE_FT);
    expect(Math.abs(tasMs - initialTasMs) * 1.94384449).toBeLessThanOrEqual(DRIFT_TAS_KT);
    expect(pitchDeg).toBeLessThanOrEqual(DRIFT_PITCH_DEG);
    expect(Math.abs(state.velocity.v)).toBeLessThanOrEqual(DRIFT_LATERAL_MS);
    expect(Math.abs(state.angularVel.p)).toBeLessThanOrEqual(DRIFT_ROLL_RATE_RAD_S);
    expect(Math.abs(state.angularVel.r)).toBeLessThanOrEqual(DRIFT_YAW_RATE_RAD_S);
  });

  it('produces consistent drift at 1/60 s and 1/120 s timestep granularity', () => {
    const request = mediumRequest();
    const result = solveLevelEquilibrium(request, CALM_WIND);
    expect(result.status).toBe('converged');
    if (result.status !== 'converged') throw new Error('preset must converge');

    const state60 = structuredClone(result.aircraft);
    const state120 = structuredClone(result.aircraft);
    stateOverRunwayAt(PRESET_ALTITUDE_FT, state60);
    stateOverRunwayAt(PRESET_ALTITUDE_FT, state120);
    const dt60 = 1 / 60;
    const dt120 = 1 / 120;
    for (let tick = 0; tick < DRIFT_DURATION_S * 60; tick += 1) {
      integrate(state60, result.controls, B737_800_SPEC, dt60, CALM_WIND, request.weather);
    }
    for (let tick = 0; tick < DRIFT_DURATION_S * 120; tick += 1) {
      integrate(state120, result.controls, B737_800_SPEC, dt120, CALM_WIND, request.weather);
    }

    const alt60Ft = state60.position.alt;
    const alt120Ft = state120.position.alt;
    const tas60Ms = Math.hypot(state60.velocity.u, state60.velocity.v, state60.velocity.w);
    const tas120Ms = Math.hypot(state120.velocity.u, state120.velocity.v, state120.velocity.w);
    expect(Math.abs(alt60Ft - alt120Ft)).toBeLessThanOrEqual(DRIFT_ALTITUDE_FT);
    expect(Math.abs(tas60Ms - tas120Ms) * 1.94384449).toBeLessThanOrEqual(DRIFT_TAS_KT);
  });
});
