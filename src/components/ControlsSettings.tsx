import { useState } from 'react';
import { DEFAULT_CONTROL_BINDINGS, controlBindingLabels, validateControlBindings, type ControlBinding } from '../input/controlBindings';

interface ControlsSettingsProps {
  bindings?: ControlBinding[];
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  right: 14,
  bottom: 86,
  zIndex: 110,
  background: 'rgba(2, 8, 12, 0.82)',
  border: '1px solid rgba(157,220,255,0.35)',
  borderRadius: 8,
  color: '#e8f8ff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  padding: 10,
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
};

const toggleButtonStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid rgba(157,220,255,0.35)',
  borderRadius: 6,
  background: 'rgba(157,220,255,0.12)',
  color: '#9ddcff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.2,
  padding: '6px 8px',
  textAlign: 'left',
};

export function ControlsSettings({ bindings = DEFAULT_CONTROL_BINDINGS }: ControlsSettingsProps) {
  const [expanded, setExpanded] = useState(false);
  const labels = controlBindingLabels(bindings);
  const validation = validateControlBindings(bindings);

  return (
    <div
      role="group"
      aria-label="Controls settings"
      style={{ ...panelStyle, width: expanded ? 360 : 220 }}
    >
      <button
        type="button"
        aria-label={expanded ? 'Hide controls settings' : 'Show controls settings'}
        onClick={() => setExpanded((open) => !open)}
        style={toggleButtonStyle}
      >
        Controls settings {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: '116px 1fr', gap: '6px 10px', fontSize: 11, marginTop: 8 }}>
          {bindings.map((binding) => (
            <div key={binding.id} style={{ display: 'contents' }}>
              <div style={{ color: '#ffffff', fontWeight: 800 }}>{binding.label}</div>
              <div style={{ color: '#cfe5ef' }}>
                <div>{labels[binding.id]}</div>
                <div style={{ color: '#9db2bc', marginTop: 2 }}>{binding.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {validation.ok ? (
        <div style={{ color: '#6dff8d', fontSize: 11, marginTop: 8 }}>Bindings valid.</div>
      ) : (
        <div role="alert" style={{ color: '#ff8d8d', fontSize: 11, marginTop: 8 }}>
          {validation.errors.join(' ')}
        </div>
      )}
    </div>
  );
}
