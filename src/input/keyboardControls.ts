import type { ControlInputs } from '../sim/types';

const THROTTLE_STEP = 0.05;
const ELEVATOR_KEY_DEFLECTION = 0.5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nextFlapDetent(flaps: number): number {
  return flaps >= 40 ? 0 : flaps < 5 ? 5 : flaps + 5;
}

export function computeHeldKeyInputs(keys: ReadonlySet<string>): Partial<ControlInputs> {
  return {
    elevator: (keys.has('w') ? -ELEVATOR_KEY_DEFLECTION : 0) + (keys.has('s') ? ELEVATOR_KEY_DEFLECTION : 0),
    aileron: (keys.has('a') ? -0.5 : 0) + (keys.has('d') ? 0.5 : 0),
    rudder: (keys.has('q') ? -0.5 : 0) + (keys.has('e') ? 0.5 : 0),
    brake: keys.has(' ') ? 1 : 0,
  };
}

export function applyDiscreteKeyInput(key: string, inputs: ControlInputs): Partial<ControlInputs> | null {
  switch (key.toLowerCase()) {
    case 'arrowup': {
      const throttle = clamp01(Math.max(inputs.throttle1, inputs.throttle2) + THROTTLE_STEP);
      return { throttle1: throttle, throttle2: throttle };
    }
    case 'arrowdown': {
      const throttle = clamp01(Math.min(inputs.throttle1, inputs.throttle2) - THROTTLE_STEP);
      return { throttle1: throttle, throttle2: throttle };
    }
    case 'g':
      return { gearLever: inputs.gearLever === 'UP' ? 'DOWN' : 'UP' };
    case 'f':
      return { flapLever: nextFlapDetent(inputs.flapLever) };
    default:
      return null;
  }
}
