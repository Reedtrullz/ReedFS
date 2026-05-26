import { DEFAULT_CONTROL_BINDINGS, controlBindingLabels, validateControlBindings, type ControlBinding } from '../input/controlBindings';

interface ControlsSettingsProps {
  bindings?: ControlBinding[];
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  right: 14,
  bottom: 86,
  zIndex: 110,
  width: 360,
  background: 'rgba(2, 8, 12, 0.82)',
  border: '1px solid rgba(157,220,255,0.35)',
  borderRadius: 8,
  color: '#e8f8ff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  padding: 12,
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
};

export function ControlsSettings({ bindings = DEFAULT_CONTROL_BINDINGS }: ControlsSettingsProps) {
  const labels = controlBindingLabels(bindings);
  const validation = validateControlBindings(bindings);

  return (
    <div role="group" aria-label="Controls settings" style={panelStyle}>
      <div style={{ color: '#9ddcff', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, marginBottom: 8 }}>
        Controls settings
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '86px 1fr', gap: '6px 10px', fontSize: 11 }}>
        {bindings.map((binding) => (
          <div key={binding.id} style={{ display: 'contents' }}>
            <div style={{ color: '#ffffff', fontWeight: 800 }}>{binding.label}</div>
            <div style={{ color: '#cfe5ef' }}>{labels[binding.id]}</div>
          </div>
        ))}
      </div>
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
