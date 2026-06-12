import type { ControlInputs } from '../sim/types';

export interface GearCommandResult {
  gearLever: ControlInputs['gearLever'];
  rejectedReason: 'positive-rate-required' | null;
}

export function resolveGearLeverCommand(input: {
  current: ControlInputs['gearLever'];
  requested?: ControlInputs['gearLever'];
  positiveRate: boolean;
}): GearCommandResult {
  const requested = input.requested ?? (input.current === 'UP' ? 'DOWN' : 'UP');
  if (requested === input.current) return { gearLever: input.current, rejectedReason: null };
  if (requested === 'DOWN') return { gearLever: 'DOWN', rejectedReason: null };
  if (!input.positiveRate) return { gearLever: input.current, rejectedReason: 'positive-rate-required' };
  return { gearLever: 'UP', rejectedReason: null };
}
