import type { AutopilotState, LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';
import type { EnabledMcpMode } from '../store/selectors';

export type FlightDirectorSide = 'left' | 'right';

function clearBoeingModeFlags(apState: AutopilotState): void {
  apState.boeing.hdgSel = false;
  apState.boeing.lnav = false;
  apState.boeing.vnav = false;
  apState.boeing.altHold = false;
  apState.boeing.vs = false;
  apState.boeing.speedMode = false;
  apState.boeing.n1 = false;
}

export function toggleFlightDirectorSwitch(apState: AutopilotState, side: FlightDirectorSide): void {
  if (side === 'left') {
    apState.boeing.fdLeft = !apState.boeing.fdLeft;
  } else {
    apState.boeing.fdRight = !apState.boeing.fdRight;
  }
}

export function applyMcpMode(apState: AutopilotState, mode: EnabledMcpMode): void {
  if (mode === 'OFF') {
    apState.truth.lateralActive = 'OFF';
    apState.truth.verticalActive = 'OFF';
    apState.truth.thrustActive = 'OFF';
    apState.truth.autopilotStatus = 'OFF';
    clearBoeingModeFlags(apState);
    apState.boeing.cmdA = false;
    apState.boeing.cmdB = false;
    return;
  }

  if (mode === 'SPEED' || mode === 'N1') {
    apState.truth.thrustActive = mode as ThrustMode;
    apState.boeing.speedMode = mode === 'SPEED';
    apState.boeing.n1 = mode === 'N1';
    apState.boeing.autothrottleArm = true;
    return;
  }

  apState.truth.autopilotStatus = 'CMD_A';
  apState.boeing.cmdA = true;

  if (mode === 'HDG_SEL' || mode === 'LNAV') {
    const lateral: LateralMode = mode;
    apState.truth.lateralActive = lateral;
    apState.boeing.hdgSel = mode === 'HDG_SEL';
    apState.boeing.lnav = mode === 'LNAV';
  } else if (mode === 'ALT_HOLD' || mode === 'VS') {
    const vertical: VerticalMode = mode;
    apState.truth.verticalActive = vertical;
    apState.boeing.altHold = mode === 'ALT_HOLD';
    apState.boeing.vs = mode === 'VS';
    apState.boeing.vnav = false;
    if (mode === 'VS' && !Number.isFinite(apState.boeing.verticalSpeed)) {
      apState.boeing.verticalSpeed = 0;
    }
  } else if (mode === 'VNAV') {
    apState.truth.verticalActive = 'VNAV';
    apState.boeing.vnav = true;
    apState.boeing.altHold = false;
    apState.boeing.vs = false;
  }
}
