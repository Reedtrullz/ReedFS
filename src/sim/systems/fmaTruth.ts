import type { AutoflightTruthState, AutopilotState } from '@shared/autopilot/autopilotTypes';
import {
  deriveEffectiveAutoflightTruth,
  type EffectiveAutoflightTruthContext,
} from './effectiveAutoflightTruth';

export type FmaTruthContext = EffectiveAutoflightTruthContext;

export function deriveDisplayFmaTruth(
  apState: AutopilotState | null | undefined,
  context: FmaTruthContext = {},
): AutoflightTruthState {
  return deriveEffectiveAutoflightTruth(apState, context);
}
