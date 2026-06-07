export type ControlBindingId =
  | 'pitch'
  | 'roll'
  | 'rudder'
  | 'throttle'
  | 'brake'
  | 'differentialBrake'
  | 'gear'
  | 'flaps'
  | 'trim'
  | 'camera'
  | 'overlay';

export interface ControlBinding {
  id: ControlBindingId;
  label: string;
  keyboard: string[];
  gamepad: string[];
  description: string;
}

export type ControlBindingValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export const DEFAULT_CONTROL_BINDINGS: ControlBinding[] = [
  {
    id: 'pitch',
    label: 'Pitch',
    keyboard: ['W/S'],
    gamepad: ['Gamepad left stick Y'],
    description: 'Rotate, climb, and lower the nose with small inputs.',
  },
  {
    id: 'roll',
    label: 'Roll',
    keyboard: ['A/D'],
    gamepad: ['Gamepad left stick X'],
    description: 'Bank left/right for hand-flying and pattern work.',
  },
  {
    id: 'rudder',
    label: 'Rudder',
    keyboard: ['Q/E'],
    gamepad: ['Gamepad right stick X'],
    description: 'Yaw control and runway centerline corrections.',
  },
  {
    id: 'throttle',
    label: 'Throttle',
    keyboard: ['ArrowUp/ArrowDown'],
    gamepad: ['Gamepad RT/LT'],
    description: 'Smooth thrust increase/decrease.',
  },
  {
    id: 'brake',
    label: 'Brake',
    keyboard: ['Space'],
    gamepad: ['Gamepad A/Cross'],
    description: 'Wheel braking on the ground.',
  },
  {
    id: 'differentialBrake',
    label: 'Differential brake',
    keyboard: ['Z/X'],
    gamepad: [],
    description: 'Momentary left/right wheel braking for low-speed runway steering.',
  },
  {
    id: 'gear',
    label: 'Gear',
    keyboard: ['G'],
    gamepad: ['Gamepad RB/R1'],
    description: 'Retract gear after positive rate; extend for landing.',
  },
  {
    id: 'flaps',
    label: 'Flaps',
    keyboard: ['F'],
    gamepad: ['Gamepad LB/L1'],
    description: 'Cycle flap detents for takeoff/approach setup.',
  },
  {
    id: 'trim',
    label: 'Trim',
    keyboard: ['8 / 9'],
    gamepad: ['Gamepad D-pad up/down'],
    description: 'Stabilizer trim for hands-off pitch force reduction.',
  },
  {
    id: 'camera',
    label: 'Camera',
    keyboard: ['C'],
    gamepad: [],
    description: 'Cycle chase, cockpit, and tower camera modes.',
  },
  {
    id: 'overlay',
    label: 'Overlay',
    keyboard: ['O'],
    gamepad: [],
    description: 'Cycle flight, minimal, and debug overlays.',
  },
];

export function controlBindingLabels(bindings: ControlBinding[]): Record<ControlBindingId, string> {
  return bindings.reduce((labels, binding) => ({
    ...labels,
    [binding.id]: [...binding.keyboard, ...binding.gamepad].join(' · ') || 'Unassigned',
  }), {} as Record<ControlBindingId, string>);
}

export function validateControlBindings(bindings: ControlBinding[]): ControlBindingValidationResult {
  const errors: string[] = [];
  const keyboardOwners = new Map<string, ControlBindingId>();

  for (const binding of bindings) {
    for (const key of binding.keyboard) {
      const normalized = key.trim().toLowerCase();
      if (!normalized) continue;
      const existing = keyboardOwners.get(normalized);
      if (existing && existing !== binding.id) {
        errors.push(`Duplicate keyboard binding "${key}" assigned to ${existing} and ${binding.id}`);
      } else {
        keyboardOwners.set(normalized, binding.id);
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
