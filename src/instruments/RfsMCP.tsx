import { useSimStore } from '../store/simStore';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import { createDefaultAutopilotStateFromAircraft } from './defaultAutopilotState';
import { applyMcpMode, toggleFlightDirectorSwitch, type FlightDirectorSide } from './mcpCommands';
import {
  mcpModeAvailability,
  selectMcpViewModel,
  type EnabledMcpMode,
  type McpModeAvailability,
  type McpModeAvailabilityState,
} from '../store/selectors';

export { mcpModeAvailability };
export type { EnabledMcpMode, McpModeAvailability, McpModeAvailabilityState };

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

export function RfsMCP() {
  const {
    vertActive,
    thrActive,
    vnavAvailable,
    vnavActive,
    fdLeft,
    fdRight,
    displayedLatActive,
    modeAvailability,
    unavailableSummary,
    speedTarget,
    headingTarget,
    altitudeTarget,
    verticalSpeedTarget,
  } = useSimStore(selectMcpViewModel);

  const toggleMode = (mode: EnabledMcpMode) => {
    const state = useSimStore.getState();
    const availability = selectMcpViewModel(state).modeAvailability[mode];
    if (!availability.available) return;
    const current = state.apState;
    const next = structuredClone(current ?? createDefaultAutopilotStateFromAircraft(state.aircraft, state.wind));
    applyMcpMode(next, mode);
    state.setApState(next);
  };

  const toggleFlightDirector = (side: FlightDirectorSide) => {
    const state = useSimStore.getState();
    const current = state.apState;
    const next = structuredClone(current ?? createDefaultAutopilotStateFromAircraft(state.aircraft, state.wind));
    toggleFlightDirectorSwitch(next, side);
    state.setApState(next);
  };

  const editTarget = (target: McpTarget, delta: number) => {
    const state = useSimStore.getState();
    const current = state.apState;
    const next = structuredClone(current ?? createDefaultAutopilotStateFromAircraft(state.aircraft, state.wind));
    applyMcpTargetDelta(next, target, delta);
    state.setApState(next);
  };

  const modeButtonStyle = (mode: EnabledMcpMode, active: boolean): React.CSSProperties => {
    if (active) return activeStyle;
    return modeAvailability[mode].available
      ? btnStyle
      : { ...btnStyle, color: '#777', border: '1px solid #444', cursor: 'not-allowed' };
  };
  const modeTitle = (mode: EnabledMcpMode, availableTitle: string): string => (
    modeAvailability[mode].available ? availableTitle : `MCP mode unavailable: ${modeAvailability[mode].reason}`
  );
  return (
    <section
      aria-label="Mode control panel"
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
      {unavailableSummary && (
        <div role="status" style={{ color: '#f6d365', fontFamily: 'monospace', fontSize: 10, marginBottom: 4, maxWidth: 220 }}>
          MCP modes unavailable: {unavailableSummary}
        </div>
      )}
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
          aria-disabled={!modeAvailability.HDG_SEL.available}
          aria-pressed={displayedLatActive === 'HDG_SEL'}
          disabled={!modeAvailability.HDG_SEL.available}
          title={modeTitle('HDG_SEL', 'Engage HDG SEL')}
          onClick={() => toggleMode('HDG_SEL')}
          style={modeButtonStyle('HDG_SEL', displayedLatActive === 'HDG_SEL')}
        >
          HDG
        </button>
        <button
          aria-disabled={!modeAvailability.LNAV.available}
          aria-pressed={displayedLatActive === 'LNAV'}
          disabled={!modeAvailability.LNAV.available}
          title={modeTitle('LNAV', 'Engage LNAV')}
          onClick={() => toggleMode('LNAV')}
          style={modeButtonStyle('LNAV', displayedLatActive === 'LNAV')}
        >
          LNAV
        </button>
      </div>
      <div>
        <button
          aria-disabled={!modeAvailability.ALT_HOLD.available}
          aria-pressed={vertActive === 'ALT_HOLD' && !vnavActive}
          disabled={!modeAvailability.ALT_HOLD.available}
          title={modeTitle('ALT_HOLD', 'Engage altitude hold')}
          onClick={() => toggleMode('ALT_HOLD')}
          style={modeButtonStyle('ALT_HOLD', vertActive === 'ALT_HOLD' && !vnavActive)}
        >
          ALT
        </button>
        {vnavAvailable && (
          <button
            aria-disabled={!modeAvailability.VNAV.available}
            aria-pressed={vnavActive}
            disabled={!modeAvailability.VNAV.available}
            title={modeTitle('VNAV', 'Engage VNAV')}
            onClick={() => toggleMode('VNAV')}
            style={modeButtonStyle('VNAV', vnavActive)}
          >
            VNAV
          </button>
        )}
        <button
          aria-disabled={!modeAvailability.VS.available}
          aria-pressed={vertActive === 'VS'}
          disabled={!modeAvailability.VS.available}
          title={modeTitle('VS', 'Engage vertical speed')}
          onClick={() => toggleMode('VS')}
          style={modeButtonStyle('VS', vertActive === 'VS')}
        >
          VS
        </button>
      </div>
      <div>
        <button
          aria-disabled={!modeAvailability.SPEED.available}
          aria-pressed={thrActive === 'SPEED'}
          disabled={!modeAvailability.SPEED.available}
          title={modeTitle('SPEED', 'Engage SPEED autothrottle')}
          onClick={() => toggleMode('SPEED')}
          style={modeButtonStyle('SPEED', thrActive === 'SPEED')}
        >
          SPD
        </button>
        <button
          aria-disabled={!modeAvailability.N1.available}
          aria-pressed={thrActive === 'N1'}
          disabled={!modeAvailability.N1.available}
          title={modeTitle('N1', 'Engage N1 autothrottle')}
          onClick={() => toggleMode('N1')}
          style={modeButtonStyle('N1', thrActive === 'N1')}
        >
          N1
        </button>
        <button onClick={() => toggleMode('OFF')} style={btnStyle}>
          OFF
        </button>
      </div>
    </section>
  );
}
