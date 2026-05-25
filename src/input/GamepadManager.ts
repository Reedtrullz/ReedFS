import type { ControlInputs } from '../sim/types';

export function readGamepad(): Partial<ControlInputs> | null {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[0];
  if (!gp) return null;

  const leftX = gp.axes[0] ?? 0;
  const leftY = gp.axes[1] ?? 0;
  const rightX = gp.axes[2] ?? 0;

  const elevator = leftY * 0.7;
  const aileron = leftX * 0.7;
  const rudder = rightX * 0.5;

  let throttle1 = 0.5;
  if (gp.buttons[7]?.value) throttle1 = 0.5 + gp.buttons[7].value * 0.5;
  if (gp.buttons[6]?.value) throttle1 = 0.5 - gp.buttons[6].value * 0.5;
  const throttle2 = throttle1;

  return { elevator, aileron, rudder, throttle1, throttle2 };
}
