import { describe, expect, it } from 'vitest';
import {
  controlPatchFromInputManager,
  defaultInputs,
  inputActionsIncludeManualApAxis,
  isRejectedTakeoffAbortLatched,
  sanitizeSetInputPartial,
} from '../simStoreInputReducers';
import type { AircraftState, ControlInputs } from '../../sim/types';
import { createInputManagerState } from '../../input/InputManager';

describe('sanitizeSetInputPartial', () => {
  it('preserves the partial object when the autopilot does not own controls', () => {
    const partial: Partial<ControlInputs> = { elevator: 0.2 };
    const result = sanitizeSetInputPartial(partial, { ...defaultInputs }, { ...defaultInputs }, false, false);

    expect(result.pilotPatch).toBe(partial);
    expect(result.shouldDisconnect).toBe(false);
  });

  it('removes throttle keys owned by the autopilot', () => {
    const result = sanitizeSetInputPartial(
      { throttle1: 0.5, throttle2: 0.5 },
      { ...defaultInputs },
      { ...defaultInputs },
      false,
      true,
    );

    expect(result.pilotPatch).not.toHaveProperty('throttle1');
    expect(result.pilotPatch).not.toHaveProperty('throttle2');
    expect(result.shouldDisconnect).toBe(false);
  });

  it('removes an autopilot-owned axis matching effective control but not pilot input', () => {
    const pilotInputs = { ...defaultInputs, elevator: 0 };
    const effectiveControls = { ...defaultInputs, elevator: 0.2 };
    const result = sanitizeSetInputPartial({ elevator: 0.2 }, pilotInputs, effectiveControls, true, false);

    expect(result.pilotPatch).not.toHaveProperty('elevator');
    expect(result.shouldDisconnect).toBe(false);
  });

  it('keeps an axis that differs from effective control and requests disconnect', () => {
    const result = sanitizeSetInputPartial(
      { elevator: 0.3 },
      { ...defaultInputs, elevator: 0 },
      { ...defaultInputs, elevator: 0.2 },
      true,
      false,
    );

    expect(result.pilotPatch).toEqual({ elevator: 0.3 });
    expect(result.shouldDisconnect).toBe(true);
  });

  it('keeps an axis matching both effective and pilot input without disconnecting', () => {
    const pilotInputs = { ...defaultInputs, elevator: 0 };
    const result = sanitizeSetInputPartial({ elevator: 0 }, pilotInputs, { ...pilotInputs }, true, false);

    expect(result.pilotPatch).toEqual({ elevator: 0 });
    expect(result.shouldDisconnect).toBe(false);
  });
});

describe('controlPatchFromInputManager', () => {
  const manager = () => createInputManagerState({ ...defaultInputs });

  it('returns an empty patch for identical managers with no actions', () => {
    const state = manager();
    expect(controlPatchFromInputManager({ ...defaultInputs }, state, state, {})).toEqual({});
  });

  it('advances the flap lever to the next detent', () => {
    const state = manager();
    expect(controlPatchFromInputManager({ ...defaultInputs, flapLever: 0 }, state, state, { flapNext: true }))
      .toEqual({ flapLever: 1 });
  });

  it.each([
    ['UP', 'DOWN'],
    ['DOWN', 'UP'],
  ] as const)('toggles gear from %s to %s', (gearLever, expected) => {
    const state = manager();
    expect(controlPatchFromInputManager({ ...defaultInputs, gearLever }, state, state, { gearToggle: true }))
      .toEqual({ gearLever: expected });
  });

  it.each([
    [undefined, true],
    [true, false],
  ])('toggles spoiler arm from %s to %s', (spoilersArmed, expected) => {
    const state = manager();
    const current = { ...defaultInputs, spoilersArmed } as ControlInputs;
    expect(controlPatchFromInputManager(current, state, state, { spoilerArmToggle: true }))
      .toEqual({ spoilersArmed: expected });
  });

  it.each([
    [0, -1],
    [-1, 0],
  ])('toggles reverse from %s to %s', (reverse, expected) => {
    const state = manager();
    const current = { ...defaultInputs, reverse } as ControlInputs;
    expect(controlPatchFromInputManager(current, state, state, { reverseToggle: true }))
      .toEqual({ reverse: expected });
  });

  it('writes both engine throttles when manager throttle changes without a throttle action', () => {
    const previous = manager();
    const next = createInputManagerState({ ...defaultInputs, throttle: 0.4 });
    expect(controlPatchFromInputManager({ ...defaultInputs }, previous, next, {}))
      .toEqual({ throttle1: 0.4, throttle2: 0.4 });
  });
});

describe('isRejectedTakeoffAbortLatched', () => {
  const aircraft = {
    flightPhase: 'TAKEOFF',
    ground: { weightOnWheels: true },
  } as unknown as AircraftState;
  const inputs: ControlInputs = { ...defaultInputs, throttle1: 0.2, throttle2: 0.2, brake: 0.8, spoilers: 0.95 };

  it('latches at the exact rejected-takeoff boundary', () => {
    expect(isRejectedTakeoffAbortLatched('running', aircraft, inputs)).toBe(true);
  });

  it.each([
    ['paused status', 'paused', aircraft, inputs],
    ['cruise phase', 'running', { ...aircraft, flightPhase: 'CRUISE' }, inputs],
    ['airborne', 'running', { ...aircraft, ground: { weightOnWheels: false } }, inputs],
    ['throttle 1 above limit', 'running', aircraft, { ...inputs, throttle1: 0.21 }],
    ['throttle 2 above limit', 'running', aircraft, { ...inputs, throttle2: 0.21 }],
    ['brake below limit', 'running', aircraft, { ...inputs, brake: 0.79 }],
    ['spoilers below limit', 'running', aircraft, { ...inputs, spoilers: 0.94 }],
  ] as const)('does not latch when %s', (_case, status, changedAircraft, changedInputs) => {
    expect(isRejectedTakeoffAbortLatched(status, changedAircraft as AircraftState, changedInputs)).toBe(false);
  });
});

describe('inputActionsIncludeManualApAxis', () => {
  it('does not include manual AP axes while the autopilot is inactive', () => {
    expect(inputActionsIncludeManualApAxis({ pitch: 1 }, false)).toBe(false);
  });

  it.each([
    ['pitch', { pitch: 1 }],
    ['roll', { roll: 1 }],
  ] as const)('includes %s while the autopilot is active', (_axis, actions) => {
    expect(inputActionsIncludeManualApAxis(actions, true)).toBe(true);
  });

  it('does not include yaw as a manual AP axis', () => {
    expect(inputActionsIncludeManualApAxis({ yaw: 1 }, true)).toBe(false);
  });
});
