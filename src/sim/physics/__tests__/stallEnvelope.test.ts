import { describe, expect, it } from 'vitest';
import { computeAero } from '../aero';
import { isaAtAltitude } from '../atmosphere';
import { B737_800_SPEC, createInitialState, type AircraftState } from '../../types';
import { applyIasFlightCondition } from './fdmFixtureHelpers';
import { degToRad } from '../units';

interface StallSample {
  aoaDeg: number;
  cl: number;
  cd: number;
}

function sampleAtAoA(options: {
  iasKt: number;
  altitudeFt: number;
  aoaDeg: number;
  flapSetting: number;
  gearDown: boolean;
}): StallSample {
  const state: AircraftState = createInitialState(B737_800_SPEC);
  state.grossWeight = 62_000;
  state.cg = 25;
  state.ground = { ...state.ground, weightOnWheels: false, normalForceN: 0, contact: 'none', onRunway: false };
  applyIasFlightCondition(state, {
    iasKt: options.iasKt,
    altitudeFt: options.altitudeFt,
    angleOfAttackRad: degToRad(options.aoaDeg),
    flapSetting: options.flapSetting,
    gearDown: options.gearDown,
  });

  const aero = computeAero(state, {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0,
    throttle2: 0,
    flapLever: options.flapSetting,
    gearLever: options.gearDown ? 'DOWN' : 'UP',
    spoilers: 0,
    brake: 0,
  }, B737_800_SPEC);
  const tasMs = Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w);
  const q = 0.5 * isaAtAltitude(options.altitudeFt).density * tasMs * tasMs;

  return {
    aoaDeg: options.aoaDeg,
    cl: aero.lift / (q * B737_800_SPEC.wingArea),
    cd: aero.drag / (q * B737_800_SPEC.wingArea),
  };
}

function sweepStall(options: { iasKt: number; altitudeFt: number; flapSetting: number; gearDown: boolean }): StallSample[] {
  const samples: StallSample[] = [];
  for (let aoaDeg = -4; aoaDeg <= 26; aoaDeg += 2) {
    samples.push(sampleAtAoA({ ...options, aoaDeg }));
  }
  return samples;
}

function peakLift(samples: StallSample[]): StallSample {
  return samples.reduce((best, sample) => sample.cl > best.cl ? sample : best, samples[0]);
}

describe('B737 broad stall envelope smoke tests', () => {
  it('keeps clean configuration CLmax finite and shows post-stall lift decay', () => {
    const samples = sweepStall({ iasKt: 170, altitudeFt: 5_000, flapSetting: 0, gearDown: false });
    const peak = peakLift(samples);
    const postStall = samples.at(-1)!;

    // Broad RFS gameplay-source bounds, not certified Boeing data.
    expect(peak.aoaDeg).toBeGreaterThanOrEqual(10);
    expect(peak.aoaDeg).toBeLessThanOrEqual(22);
    expect(peak.cl).toBeGreaterThan(1.2);
    expect(peak.cl).toBeLessThan(1.8);
    expect(postStall.cl).toBeLessThan(peak.cl);
    expect(postStall.cd).toBeGreaterThan(samples[0].cd);
  });

  it('landing configuration produces a higher finite lift peak and much higher drag', () => {
    const clean = sweepStall({ iasKt: 170, altitudeFt: 5_000, flapSetting: 0, gearDown: false });
    const landing = sweepStall({ iasKt: 135, altitudeFt: 1_500, flapSetting: 30, gearDown: true });
    const cleanPeak = peakLift(clean);
    const landingPeak = peakLift(landing);
    const cleanAtApproachAoA = clean.find((sample) => sample.aoaDeg === 8)!;
    const landingAtApproachAoA = landing.find((sample) => sample.aoaDeg === 8)!;

    // Broad RFS gameplay-source bounds, not certified Boeing data.
    expect(landingPeak.cl).toBeGreaterThan(cleanPeak.cl + 0.45);
    expect(landingPeak.cl).toBeLessThan(2.9);
    expect(landingPeak.aoaDeg).toBeGreaterThanOrEqual(8);
    expect(landingPeak.aoaDeg).toBeLessThanOrEqual(22);
    expect(landingAtApproachAoA.cd).toBeGreaterThan(cleanAtApproachAoA.cd * 2);
  });
});
