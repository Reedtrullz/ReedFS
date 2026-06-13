import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTROL_BINDINGS,
  controlBindingLabels,
  validateControlBindings,
} from '../controlBindings';
import { B737_FLAP_DETENTS } from '../flapDetents';

describe('controlBindings', () => {
  it('default bindings include the core keyboard/gamepad actions needed for repeated play', () => {
    expect(DEFAULT_CONTROL_BINDINGS.map((binding) => binding.id)).toEqual([
      'pitch',
      'roll',
      'rudder',
      'throttle',
      'brake',
      'differentialBrake',
      'gear',
      'flaps',
      'trim',
      'camera',
      'overlay',
    ]);
  });

  it('formats current binding names for UI display', () => {
    const labels = controlBindingLabels(DEFAULT_CONTROL_BINDINGS);

    expect(labels.pitch).toContain('W/S');
    expect(labels.throttle).toContain('ArrowUp/ArrowDown');
    expect(labels.throttle).toContain('Gamepad RT/LT');
    expect(labels.brake).toContain('Gamepad A/Cross');
    expect(labels.gear).toContain('Gamepad RB/R1');
    expect(labels.flaps).toContain('Gamepad LB/L1');
    expect(labels.differentialBrake).toContain('Z/X');
    expect(labels.camera).toContain('C');
    expect(labels.overlay).toContain('O');
  });

  it('validates defaults without duplicate keys and exposes a differential brake row', () => {
    const result = validateControlBindings(DEFAULT_CONTROL_BINDINGS);
    const differentialBrake = DEFAULT_CONTROL_BINDINGS.find((binding) => binding.id === 'differentialBrake');

    expect(result).toEqual({ ok: true });
    expect(differentialBrake).toEqual(expect.objectContaining({
      label: 'Differential brake',
      keyboard: ['Z/X'],
      description: expect.stringMatching(/left\/right|side/i),
    }));
  });

  it('describes flaps with the shared B737 detent model', () => {
    const flaps = DEFAULT_CONTROL_BINDINGS.find((binding) => binding.id === 'flaps');

    expect(flaps).toEqual(expect.objectContaining({
      description: expect.stringContaining(B737_FLAP_DETENTS.join('/')),
    }));
  });

  it('rejects duplicate keyboard assignments inside the editable model', () => {
    const duplicate = DEFAULT_CONTROL_BINDINGS.map((binding) => (
      binding.id === 'roll'
        ? { ...binding, keyboard: ['W/S'] }
        : binding
    ));

    const result = validateControlBindings(duplicate);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/duplicate/i);
  });
});
