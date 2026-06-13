import type { CSSProperties } from 'react';
import { useSimStore } from '../store/simStore';
import { THROTTLE_STEP, TRIM_STEP_UNITS } from '../input/keyboardControls';

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 14,
  left: 360,
  zIndex: 110,
  width: 300,
  background: 'rgba(2, 8, 12, 0.82)',
  border: '1px solid rgba(255, 207, 136, 0.45)',
  borderRadius: 8,
  color: '#fff3df',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  padding: 12,
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
};

const titleStyle: CSSProperties = {
  color: '#ffcf88',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
};

const valuesStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 6,
  marginTop: 10,
};

const valueStyle: CSSProperties = {
  background: 'rgba(255, 207, 136, 0.1)',
  border: '1px solid rgba(255, 207, 136, 0.22)',
  borderRadius: 4,
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 800,
  padding: '6px 8px',
};

const buttonsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  marginTop: 10,
};

const buttonStyle: CSSProperties = {
  background: 'rgba(255, 207, 136, 0.14)',
  border: '1px solid rgba(255, 207, 136, 0.48)',
  borderRadius: 4,
  color: '#fff3df',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 800,
  padding: '7px 8px',
};

function formatThrottlePercent(throttle1: number, throttle2: number): string {
  return `${Math.round(Math.max(throttle1, throttle2) * 100)}%`;
}

export function TakeoffSetupPanel() {
  const inputs = useSimStore((s) => s.inputs);
  const stabilizerTrimUnits = useSimStore((s) => s.aircraft.config.stabilizerTrimUnits);
  const applyInputActions = useSimStore((s) => s.applyInputActions);

  return (
    <section aria-label="Takeoff setup" style={panelStyle}>
      <div style={titleStyle}>Takeoff setup</div>
      <div style={{ color: '#ffdfad', fontSize: 11, lineHeight: 1.4, marginTop: 5 }}>
        Configure the B737 before pressing START ROLL.
      </div>

      <div aria-label="Current takeoff configuration" style={valuesStyle}>
        <div style={valueStyle}>Flaps {inputs.flapLever}</div>
        <div style={valueStyle}>Trim {stabilizerTrimUnits.toFixed(1)}</div>
        <div style={valueStyle}>Throttle {formatThrottlePercent(inputs.throttle1, inputs.throttle2)}</div>
        <div style={valueStyle}>Gear {inputs.gearLever}</div>
      </div>

      <div aria-label="Takeoff setup controls" style={buttonsStyle}>
        <button style={buttonStyle} type="button" onClick={() => applyInputActions({ flapNext: true }, 0)}>
          Flaps Up
        </button>
        <button style={buttonStyle} type="button" onClick={() => applyInputActions({ trimDelta: TRIM_STEP_UNITS }, 0)}>
          Trim Nose Up
        </button>
        <button style={buttonStyle} type="button" onClick={() => applyInputActions({ throttleDelta: THROTTLE_STEP }, 0)}>
          Throttle Up
        </button>
        <button style={buttonStyle} type="button" onClick={() => applyInputActions({ gearToggle: true }, 0)}>
          Gear
        </button>
      </div>
    </section>
  );
}
