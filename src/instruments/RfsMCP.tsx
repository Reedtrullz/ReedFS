import { useSimStore } from '../store/simStore';
import type { AutopilotState, LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';

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

type EnabledMcpMode = 'HDG_SEL' | 'LNAV' | 'ALT_HOLD' | 'VS' | 'SPEED' | 'OFF';

export function createDefaultAutopilotState(): AutopilotState {
  return {
    boeing: {
      courseL: 0,
      courseR: 0,
      speed: null as number | null,
      mach: null as number | null,
      heading: 0,
      altitude: 10000,
      verticalSpeed: null as number | null,
      fdLeft: false,
      fdRight: false,
      autothrottleArm: true,
      n1: false,
      speedMode: false,
      lnav: false,
      vnav: false,
      lvlChg: false,
      hdgSel: false,
      vorLoc: false,
      app: false,
      altHold: false,
      vs: false,
      cmdA: true,
      cmdB: false,
      cwsA: false,
      cwsB: false,
    },
    airbus: {
      speed: null,
      speedManaged: false,
      heading: null,
      headingManaged: false,
      altitude: 10000,
      altitudeManaged: false,
      verticalSpeed: null,
      fpa: null,
      fd1: false,
      fd2: false,
      athr: false,
      ap1: false,
      ap2: false,
      loc: false,
      appr: false,
      exped: false,
      hdgTrkMode: 'HDG_VS' as const,
      metricAltitude: false,
      speedMachMode: 'SPD' as const,
    },
    truth: {
      lateralActive: 'OFF',
      verticalActive: 'OFF',
      thrustActive: 'OFF',
      autopilotStatus: 'OFF',
      lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
    },
  };
}

function clearBoeingModeFlags(apState: AutopilotState): void {
  apState.boeing.hdgSel = false;
  apState.boeing.lnav = false;
  apState.boeing.vnav = false;
  apState.boeing.altHold = false;
  apState.boeing.vs = false;
  apState.boeing.speedMode = false;
  apState.boeing.n1 = false;
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
  } else if (mode === 'SPEED') {
    const thrust: ThrustMode = mode;
    apState.truth.thrustActive = thrust;
    apState.boeing.speedMode = true;
    apState.boeing.n1 = false;
    apState.boeing.autothrottleArm = true;
  }
}

export function RfsMCP() {
  const apState = useSimStore((s) => s.apState);

  const toggleMode = (mode: EnabledMcpMode) => {
    const current = useSimStore.getState().apState;
    const next = structuredClone(current ?? createDefaultAutopilotState());
    applyMcpMode(next, mode);
    useSimStore.getState().setApState(next);
  };

  const latActive = apState?.truth.lateralActive ?? 'OFF';
  const vertActive = apState?.truth.verticalActive ?? 'OFF';
  const thrActive = apState?.truth.thrustActive ?? 'OFF';

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
      <div>
        <button
          onClick={() => toggleMode('HDG_SEL')}
          style={latActive === 'HDG_SEL' ? activeStyle : btnStyle}
        >
          HDG
        </button>
        <button
          onClick={() => toggleMode('LNAV')}
          style={latActive === 'LNAV' ? activeStyle : btnStyle}
        >
          LNAV
        </button>
      </div>
      <div>
        <button
          onClick={() => toggleMode('ALT_HOLD')}
          style={vertActive === 'ALT_HOLD' ? activeStyle : btnStyle}
        >
          ALT
        </button>
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
        <button onClick={() => toggleMode('OFF')} style={btnStyle}>
          OFF
        </button>
      </div>
    </div>
  );
}
