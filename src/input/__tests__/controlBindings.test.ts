import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTROL_BINDINGS,
  controlBindingLabels,
  validateControlBindings,
} from '../controlBindings';

describe('controlBindings', () => {
  it('default bindings include the core keyboard/gamepad actions needed for repeated play', () => {
    expect(DEFAULT_CONTROL_BINDINGS.map((binding) => binding.id)).toEqual([
      'pitch',
      'roll',
      'rudder',
      'throttle',
      'brake',
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
