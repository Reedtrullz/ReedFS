import { useSimStore } from '../store/simStore';
import type { AutopilotState, LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';
import { createDefaultAutopilotState } from './defaultAutopilotState';
import { deriveEffectiveAutoflightTruth } from '../sim/systems/effectiveAutoflightTruth';

const btnStyle: React.CSSProperties = {
  background: '#333',
  color: '#0f0',
  border: '1px solid #555',
  padding: '4px 10px',
  fontFamily: 'monospace',
  fontSize: 11,
  cursor: 'pointer',
  margin: 2,
  borderRadius: 3,
};

const activeStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#0a0',
  color: '#000',
  border: '1px solid #0f0',
};

const targetButtonStyle: React.CSSProperties = {
  ...btnStyle,
  padding: '2px 6px',
  minWidth: 24,
};

const targetDisplayStyle: React.CSSProperties = {
  color: '#0f0',
  fontFamily: 'monospace',
  fontSize: 11,
  minWidth: 64,
  display: 'inline-block',
  textAlign: 'center',
};

type McpTarget = 'speed' | 'heading' | 'altitude' | 'verticalSpeed';
type FlightDirectorSide = 'left' | 'right';

type EnabledMcpMode = 'HDG_SEL' | 'LNAV' | 'VNAV' | 'ALT_HOLD' | 'VS' | 'SPEED' | 'N1' | 'OFF';

const VNAV_DISPLAY_MODES = new Set<VerticalMode>(['VNAV', 'VNAV_PTH', 'ALT*', 'ALT_HOLD']);

function clearBoeingModeFlags(apState: AutopilotState): void {
  apState.boeing.hdgSel = false;
  apState.boeing.lnav = false;
  apState.boeing.vnav = false;
  apState.boeing.altHold = false;
  apState.boeing.vs = false;
  apState.boeing.speedMode = false;
  apState.boeing.n1 = false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteTarget(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) ? value as number : fallback;
}

function wrapHeadingDeg(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}

function selectedSpeedKt(apState: AutopilotState | null): number {
  return clamp(Math.round(finiteTarget(apState?.boeing.speed, 250)), 100, 340);
}

function selectedHeadingDeg(apState: AutopilotState | null): number {
  return wrapHeadingDeg(finiteTarget(apState?.boeing.heading, 0));
}

function selectedAltitudeFt(apState: AutopilotState | null): number {
  return clamp(Math.round(finiteTarget(apState?.boeing.altitude, 10000) / 100) * 100, 0, 41000);
}

function selectedVerticalSpeedFpm(apState: AutopilotState | null): number {
  return clamp(Math.round(finiteTarget(apState?.boeing.verticalSpeed, 0) / 100) * 100, -6000, 6000);
}

function deriveBackedVnavMode(
  apState: AutopilotState | null,
  context: Parameters<typeof deriveEffectiveAutoflightTruth>[1],
): VerticalMode {
  const probe = structuredClone(apState ?? createDefaultAutopilotState());
  probe.truth.autopilotStatus = 'CMD_A';
  probe.truth.verticalActive = 'VNAV';
  probe.boeing.cmdA = true;
  probe.boeing.vnav = true;
  probe.boeing.altHold = false;
  probe.boeing.vs = false;

  return deriveEffectiveAutoflightTruth(probe, context).verticalActive;
}

function formatVerticalSpeed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function applyMcpTargetDelta(apState: AutopilotState, target: McpTarget, delta: number): void {
  if (target === 'speed') {
    apState.boeing.speed = clamp(selectedSpeedKt(apState) + delta, 100, 340);
  } else if (target === 'heading') {
    apState.boeing.heading = wrapHeadingDeg(selectedHeadingDeg(apState) + delta);
  } else if (target === 'altitude') {
    apState.boeing.altitude = clamp(selectedAltitudeFt(apState) + delta, 0, 41000);
  } else {
    apState.boeing.verticalSpeed = clamp(selectedVerticalSpeedFpm(apState) + delta, -6000, 6000);
  }
}

function toggleFlightDirectorSwitch(apState: AutopilotState, side: FlightDirectorSide): void {
  if (side === 'left') {
    apState.boeing.fdLeft = !apState.boeing.fdLeft;
  } else {
    apState.boeing.fdRight = !apState.boeing.fdRight;
  }
}

function applyMcpMode(apState: AutopilotState, mode: EnabledMcpMode): void {
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
  } else if (mode === 'SPEED' || mode === 'N1') {
    apState.truth.thrustActive = mode as ThrustMode;
    apState.boeing.speedMode = mode === 'SPEED';
    apState.boeing.n1 = mode === 'N1';
    apState.boeing.autothrottleArm = true;
  }
}

export function RfsMCP() {
  const apState = useSimStore((s) => s.apState);
  const aircraft = useSimStore((s) => s.aircraft);
  const flightPlan = useSimStore((s) => s.flightPlan);
  const routeStatus = useSimStore((s) => s.routeStatus);

  const toggleMode = (mode: EnabledMcpMode) => {
    const state = useSimStore.getState();
    if (mode === 'LNAV' && !state.routeStatus.lnavAvailable) return;
    if (mode === 'VNAV' && deriveBackedVnavMode(state.apState, state) === 'OFF') return;
    const current = state.apState;
    const next = structuredClone(current ?? createDefaultAutopilotState());
    applyMcpMode(next, mode);
    state.setApState(next);
  };

  const toggleFlightDirector = (side: FlightDirectorSide) => {
    const current = useSimStore.getState().apState;
    const next = structuredClone(current ?? createDefaultAutopilotState());
    toggleFlightDirectorSwitch(next, side);
    useSimStore.getState().setApState(next);
  };

  const editTarget = (target: McpTarget, delta: number) => {
    const current = useSimStore.getState().apState;
    const next = structuredClone(current ?? createDefaultAutopilotState());
    applyMcpTargetDelta(next, target, delta);
    useSimStore.getState().setApState(next);
  };

  const effectiveTruth = deriveEffectiveAutoflightTruth(apState, { aircraft, flightPlan, routeStatus });
  const latActive = effectiveTruth.lateralActive;
  const vertActive = effectiveTruth.verticalActive;
  const thrActive = effectiveTruth.thrustActive;
  const backedVnavMode = deriveBackedVnavMode(apState, { aircraft, flightPlan, routeStatus });
  const vnavAvailable = backedVnavMode !== 'OFF';
  const vnavActive = Boolean(apState?.boeing.vnav) && VNAV_DISPLAY_MODES.has(vertActive);
  const fdLeft = apState?.boeing.fdLeft ?? false;
  const fdRight = apState?.boeing.fdRight ?? false;
  const lnavAvailable = routeStatus.lnavAvailable;
  const lnavUnavailableReason = routeStatus.lnavUnavailableReason ?? 'route guidance unavailable';
  const displayedLatActive = latActive === 'LNAV' && !lnavAvailable ? 'OFF' : latActive;
  const lnavTitle = lnavAvailable ? 'Engage LNAV' : `LNAV unavailable: ${lnavUnavailableReason}`;
  const lnavStyle = displayedLatActive === 'LNAV'
    ? activeStyle
    : lnavAvailable
      ? btnStyle
      : { ...btnStyle, color: '#777', border: '1px solid #444', cursor: 'not-allowed' };
  const speedTarget = selectedSpeedKt(apState);
  const headingTarget = selectedHeadingDeg(apState);
  const altitudeTarget = selectedAltitudeFt(apState);
  const verticalSpeedTarget = selectedVerticalSpeedFpm(apState);

  return (
    <div
      style={{
        position: 'fixed',
        top: 400,
        right: 10,
        zIndex: 100,
        background: 'rgba(0,0,0,0.85)',
        padding: 8,
        borderRadius: 6,
        border: '1px solid #333',
      }}
    >
      <div style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 10, marginBottom: 4 }}>
        MCP
      </div>
      <div aria-label="Flight Director switches" style={{ marginBottom: 4 }}>
        <button
          aria-pressed={fdLeft}
          onClick={() => toggleFlightDirector('left')}
          style={fdLeft ? activeStyle : btnStyle}
          title="Toggle left Flight Director switch"
        >
          FD L
        </button>
        <button
          aria-pressed={fdRight}
          onClick={() => toggleFlightDirector('right')}
          style={fdRight ? activeStyle : btnStyle}
          title="Toggle right Flight Director switch"
        >
          FD R
        </button>
      </div>
      <div aria-label="MCP selected targets" style={{ marginBottom: 4 }}>
        <div>
          <button aria-label="SPD -5" onClick={() => editTarget('speed', -5)} style={targetButtonStyle}>-</button>
          <span style={targetDisplayStyle}>SPD {speedTarget}</span>
          <button aria-label="SPD +5" onClick={() => editTarget('speed', 5)} style={targetButtonStyle}>+</button>
        </div>
        <div>
          <button aria-label="HDG -5" onClick={() => editTarget('heading', -5)} style={targetButtonStyle}>-</button>
          <span style={targetDisplayStyle}>HDG {String(headingTarget).padStart(3, '0')}</span>
          <button aria-label="HDG +5" onClick={() => editTarget('heading', 5)} style={targetButtonStyle}>+</button>
        </div>
        <div>
          <button aria-label="ALT -1000" onClick={() => editTarget('altitude', -1000)} style={targetButtonStyle}>-</button>
          <span style={targetDisplayStyle}>ALT {altitudeTarget}</span>
          <button aria-label="ALT +1000" onClick={() => editTarget('altitude', 1000)} style={targetButtonStyle}>+</button>
        </div>
        <div>
          <button aria-label="VS -100" onClick={() => editTarget('verticalSpeed', -100)} style={targetButtonStyle}>-</button>
          <span style={targetDisplayStyle}>VS {formatVerticalSpeed(verticalSpeedTarget)}</span>
          <button aria-label="VS +100" onClick={() => editTarget('verticalSpeed', 100)} style={targetButtonStyle}>+</button>
        </div>
      </div>
      <div>
        <button
          onClick={() => toggleMode('HDG_SEL')}
          style={displayedLatActive === 'HDG_SEL' ? activeStyle : btnStyle}
        >
          HDG
        </button>
        <button
          disabled={!lnavAvailable}
          title={lnavTitle}
          onClick={() => toggleMode('LNAV')}
          style={lnavStyle}
        >
          LNAV
        </button>
      </div>
      <div>
        <button
          onClick={() => toggleMode('ALT_HOLD')}
          style={vertActive === 'ALT_HOLD' && !vnavActive ? activeStyle : btnStyle}
        >
          ALT
        </button>
        {vnavAvailable && (
          <button
            onClick={() => toggleMode('VNAV')}
            style={vnavActive ? activeStyle : btnStyle}
          >
            VNAV
          </button>
        )}
        <button
          onClick={() => toggleMode('VS')}
          style={vertActive === 'VS' ? activeStyle : btnStyle}
        >
          VS
        </button>
      </div>
      <div>
        <button
          onClick={() => toggleMode('SPEED')}
          style={thrActive === 'SPEED' ? activeStyle : btnStyle}
        >
          SPD
        </button>
        <button
          onClick={() => toggleMode('N1')}
          style={thrActive === 'N1' ? activeStyle : btnStyle}
        >
          N1
        </button>
        <button onClick={() => toggleMode('OFF')} style={btnStyle}>
          OFF
        </button>
      </div>
    </div>
  );
}
