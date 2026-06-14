import { useSimStore } from '../store/simStore';
import { selectEngineStripViewModel } from '../store/selectors';

/** Compact always-visible actual/commanded engine, flap, and gear strip.
 *  Sits at bottom-center above the button bar. */
export function EngineStrip() {
  const vm = useSimStore(selectEngineStripViewModel);

  const n1L = Math.round(vm.leftN1 * 10) / 10;
  const n1R = Math.round(vm.rightN1 * 10) / 10;
  const gearActualLabel = gearTransitLabel(vm.gearDownActual, vm.gearPositionActual);
  const gearActualColor = gearActualLabel.startsWith('TRN') ? '#f6d365' : vm.gearDownActual ? '#0f0' : '#ff0';

  return (
    <div style={containerStyle}>
      <div style={engineBlock}>
        <span style={labelStyle}>N1 ACT L</span>
        <div style={barTrack}>
          <div style={{ ...barFill, width: `${vm.leftN1}%`, background: n1Color(vm.leftN1) }} />
        </div>
        <span style={valueStyle}>{n1L.toFixed(1)}%</span>
      </div>

      <div style={engineBlock}>
        <span style={labelStyle}>N1 ACT R</span>
        <div style={barTrack}>
          <div style={{ ...barFill, width: `${vm.rightN1}%`, background: n1Color(vm.rightN1) }} />
        </div>
        <span style={valueStyle}>{n1R.toFixed(1)}%</span>
      </div>

      <div style={indicatorBlock}>
        <span style={labelStyle}>THR CMD</span>
        <span style={{ ...valueStyle, color: vm.throttleCommandPercent > 0 ? '#0f0' : '#666' }}>{vm.throttleCommandPercent}%</span>
      </div>

      <div style={divider} />

      <div style={indicatorBlock}>
        <span style={labelStyle}>FLAPS ACT</span>
        <span style={{ ...valueStyle, color: vm.flapsActual > 0 ? '#0f0' : '#666' }}>{vm.flapsActual}°</span>
      </div>

      <div style={indicatorBlock}>
        <span style={labelStyle}>FLAPS CMD</span>
        <span style={{ ...valueStyle, color: vm.flapCommand > 0 ? '#9df' : '#666' }}>{vm.flapCommand}°</span>
      </div>

      <div style={indicatorBlock}>
        <span style={labelStyle}>GEAR ACT</span>
        <span style={{ ...valueStyle, color: gearActualColor }}>
          {gearActualLabel}
        </span>
      </div>

      <div style={indicatorBlock}>
        <span style={labelStyle}>GEAR CMD</span>
        <span style={{ ...valueStyle, color: vm.gearCommand === 'DOWN' ? '#9df' : '#ff0' }}>
          {vm.gearCommand === 'DOWN' ? 'DN' : 'UP'}
        </span>
      </div>
    </div>
  );
}

function gearTransitLabel(gearDown: boolean, gearPosition: number): string {
  const position = Number.isFinite(gearPosition) ? Math.max(0, Math.min(1, gearPosition)) : gearDown ? 1 : 0;
  if (position > 0.001 && position < 0.999) return `TRN ${Math.round(position * 100)}%`;
  return gearDown ? 'DN' : 'UP';
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
