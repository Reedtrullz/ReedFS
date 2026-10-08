import { expect, it } from 'vitest';
import { computeAero } from '../aero';
import { B737_AERO } from '../../systems/AeroModel';
import { B737_800_SPEC, createInitialState, type ControlInputs } from '../../types';

const controls: ControlInputs = { elevator: -.15, aileron: .2, rudder: -.1, throttle1: .6, throttle2: .6,
  flapLever: 40, gearLever: 'UP', spoilers: .1, brake: 0 };
function forces(flapSetting: number, aoaDeg: number) {
  const state = createInitialState(B737_800_SPEC);
  state.position.alt = 10000; state.ground.groundAltFt = 0;
  state.config.flapSetting = flapSetting; state.config.gearDown = false; state.config.gearPosition = 0;
  const alpha = aoaDeg * Math.PI / 180;
  state.velocity = { u: 90 * Math.cos(alpha), v: 10, w: 90 * Math.sin(alpha) };
  return computeAero(state, controls, B737_800_SPEC);
}

it('lift, drag and pitching moment are continuous through every authored flap detent', () => {
  for (const { detent } of B737_AERO.flapPolars.slice(1)) {
    for (const aoaDeg of [-20, 4, 25]) {
      const before = forces(detent - 1e-6, aoaDeg); const at = forces(detent, aoaDeg); const after = forces(detent + 1e-6, aoaDeg);
      for (const key of ['lift', 'drag', 'pitchMoment'] as const) {
        const scale = Math.max(1, Math.abs(at[key]));
        expect(Math.abs(before[key] - at[key]) / scale, `${detent}/${aoaDeg}/${key} before`).toBeLessThan(1e-5);
        expect(Math.abs(after[key] - at[key]) / scale, `${detent}/${aoaDeg}/${key} after`).toBeLessThan(1e-5);
      }
    }
  }
});

it('a fine configuration sweep remains finite with no detent-sized force jumps', () => {
  for (const aoa of [-20, 0, 8, 30]) {
    let previous = forces(0, aoa);
    for (let setting = .05; setting <= 40; setting += .05) {
      const next = forces(setting, aoa);
      expect(Object.values(next).every(Number.isFinite)).toBe(true);
      for (const key of ['lift', 'drag', 'pitchMoment'] as const) {
        expect(Math.abs(next[key] - previous[key]) / Math.max(1, Math.abs(forces(0, aoa)[key]), Math.abs(forces(40, aoa)[key]))).toBeLessThan(.02);
      }
      previous = next;
    }
  }
});


it('preserves authored detent results exactly and clamps settings at the end polars', () => {
  for (const polar of B737_AERO.flapPolars) {
    const state = createInitialState(B737_800_SPEC); state.config.flapSetting = polar.detent;
    state.velocity = { u: 90, v: 10, w: 8 };
    const actual = computeAero(state, controls, B737_800_SPEC);
    const authored = computeAero(state, controls, B737_800_SPEC, { ...B737_AERO, flapPolars: [polar] });
    expect(actual).toEqual(authored);
  }
  expect(forces(-1, 4)).toEqual(forces(0, 4));
  expect(forces(41, 4)).toEqual(forces(40, 4));
});
