import { useSimStore } from '../store/simStore';

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

export function RfsMCP() {
  const apState = useSimStore((s) => s.apState);

  const toggleMode = (mode: string) => {
    const current = useSimStore.getState().apState;
    if (!current) {
      // Create default AP state
      const def = {
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
          lateralActive: 'OFF' as any,
          verticalActive: 'OFF' as any,
          thrustActive: 'OFF' as any,
          autopilotStatus: 'OFF' as any,
          lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
        },
      };
      useSimStore.getState().setApState(def);
      return;
    }

    const next = structuredClone(current);
    next.truth.autopilotStatus = 'CMD_A';

    if (mode === 'HDG_SEL' || mode === 'LNAV') {
      next.truth.lateralActive = mode as any;
    } else if (mode === 'ALT_HOLD' || mode === 'VS') {
      next.truth.verticalActive = mode as any;
    } else if (mode === 'SPEED' || mode === 'N1') {
      next.truth.thrustActive = mode as any;
    } else if (mode === 'OFF') {
      next.truth.lateralActive = 'OFF' as any;
      next.truth.verticalActive = 'OFF' as any;
      next.truth.thrustActive = 'OFF' as any;
    }

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
