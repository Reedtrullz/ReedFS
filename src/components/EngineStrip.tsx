import { useSimStore } from '../store/simStore';

/** Compact always-visible actual/commanded engine, flap, and gear strip.
 *  Sits at bottom-center above the button bar. */
export function EngineStrip() {
  const engines = useSimStore((s) => s.aircraft.engines);
  const flapsActual = useSimStore((s) => s.aircraft.config.flapSetting);
  const gearDownActual = useSimStore((s) => s.aircraft.config.gearDown);
  const controls = useSimStore((s) => s.effectiveControls);

  const n1L = Math.round(engines[0].n1 * 10) / 10;
  const n1R = Math.round(engines[1].n1 * 10) / 10;
  const throttleCommandPercent = Math.round(Math.max(controls.throttle1, controls.throttle2) * 100);
  const gearCommand = controls.gearLever;

  return (
    <div style={containerStyle}>
      <div style={engineBlock}>
        <span style={labelStyle}>N1 ACT L</span>
        <div style={barTrack}>
          <div style={{ ...barFill, width: `${engines[0].n1}%`, background: n1Color(engines[0].n1) }} />
        </div>
        <span style={valueStyle}>{n1L.toFixed(1)}%</span>
      </div>

      <div style={engineBlock}>
        <span style={labelStyle}>N1 ACT R</span>
        <div style={barTrack}>
          <div style={{ ...barFill, width: `${engines[1].n1}%`, background: n1Color(engines[1].n1) }} />
        </div>
        <span style={valueStyle}>{n1R.toFixed(1)}%</span>
      </div>

      <div style={indicatorBlock}>
        <span style={labelStyle}>THR CMD</span>
        <span style={{ ...valueStyle, color: throttleCommandPercent > 0 ? '#0f0' : '#666' }}>{throttleCommandPercent}%</span>
      </div>

      <div style={divider} />

      <div style={indicatorBlock}>
        <span style={labelStyle}>FLAPS ACT</span>
        <span style={{ ...valueStyle, color: flapsActual > 0 ? '#0f0' : '#666' }}>{flapsActual}°</span>
      </div>

      <div style={indicatorBlock}>
        <span style={labelStyle}>FLAPS CMD</span>
        <span style={{ ...valueStyle, color: controls.flapLever > 0 ? '#9df' : '#666' }}>{controls.flapLever}°</span>
      </div>

      <div style={indicatorBlock}>
        <span style={labelStyle}>GEAR ACT</span>
        <span style={{ ...valueStyle, color: gearDownActual ? '#0f0' : '#ff0' }}>
          {gearDownActual ? 'DN' : 'UP'}
        </span>
      </div>

      <div style={indicatorBlock}>
        <span style={labelStyle}>GEAR CMD</span>
        <span style={{ ...valueStyle, color: gearCommand === 'DOWN' ? '#9df' : '#ff0' }}>
          {gearCommand === 'DOWN' ? 'DN' : 'UP'}
        </span>
      </div>
    </div>
  );
}

function n1Color(n1: number): string {
  if (n1 < 20) return '#444';
  if (n1 < 60) return '#0a0';
  if (n1 < 90) return '#0f0';
  return '#ff0';
}

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 64,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 90,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'rgba(0,0,0,0.78)',
  border: '1px solid rgba(0,255,0,0.2)',
  borderRadius: 6,
  padding: '6px 14px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  pointerEvents: 'none',
};

const engineBlock: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const indicatorBlock: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 1,
};

const labelStyle: React.CSSProperties = {
  color: '#666',
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: 0.8,
  minWidth: 28,
  textAlign: 'center',
};

const valueStyle: React.CSSProperties = {
  color: '#0f0',
  fontSize: 14,
  fontWeight: 900,
  fontVariantNumeric: 'tabular-nums',
  minWidth: 52,
  textAlign: 'center',
};

const barTrack: React.CSSProperties = {
  width: 80,
  height: 8,
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 4,
  overflow: 'hidden',
};

const barFill: React.CSSProperties = {
  height: '100%',
  borderRadius: 4,
  transition: 'width 0.2s ease, background 0.2s ease',
};

const divider: React.CSSProperties = {
  width: 1,
  height: 30,
  background: 'rgba(0,255,0,0.15)',
};
