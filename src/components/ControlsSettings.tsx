import { useEffect, useState } from 'react';
import { DEFAULT_CONTROL_BINDINGS, controlBindingLabels, validateControlBindings, type ControlBinding } from '../input/controlBindings';
import { DEFAULT_GAMEPAD_SETTINGS, type GamepadSettingsState } from '../input/gamepadSettings';
import { previewGamepad, type GamepadPreview } from '../input/GamepadManager';

interface ControlsSettingsProps {
  bindings?: ControlBinding[];
  gamepadSettings?: GamepadSettingsState;
  onGamepadSettingsChange?: (settings: GamepadSettingsState) => void;
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

const sectionHeadingStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 1, color: '#9ddcff', margin: '10px 0 4px' };

function previewText(preview: GamepadPreview): string {
  if (!preview.connected) return 'No gamepad';
  const fmt = (v: number) => v.toFixed(3);
  return `Pitch ${fmt(preview.pitch)} / Roll ${fmt(preview.roll)} / Yaw ${fmt(preview.yaw)} / Thr ${fmt(preview.throttleRate)}`;
}

export function ControlsSettings({
  bindings = DEFAULT_CONTROL_BINDINGS,
  gamepadSettings,
  onGamepadSettingsChange,
}: ControlsSettingsProps) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<GamepadPreview>(() => previewGamepad(gamepadSettings));
  const labels = controlBindingLabels(bindings);
  const validation = validateControlBindings(bindings);
  const calibration = gamepadSettings ?? DEFAULT_GAMEPAD_SETTINGS;

  useEffect(() => {
    if (!expanded) return;
    const id = window.setInterval(() => {
      setPreview(previewGamepad(calibration));
    }, 100);
    return () => window.clearInterval(id);
  }, [expanded, calibration]);

  const update = (change: Partial<GamepadSettingsState>) => {
    if (!onGamepadSettingsChange) return;
    onGamepadSettingsChange({ ...calibration, ...change });
  };

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
        Controls settings {expanded ? '\u25BE' : '\u25B8'}
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
      {expanded && onGamepadSettingsChange && (
        <div style={{ marginTop: 10 }}>
          <div style={sectionHeadingStyle}>GAMEPAD CALIBRATION</div>
          <div style={{ display: 'grid', gap: 6, fontSize: 11 }}>
            <label style={{ display: 'grid', gridTemplateColumns: '150px 1fr 38px', gap: 6, alignItems: 'center' }}>
              Axis deadzone
              <input
                type="range" min={0} max={0.5} step={0.01}
                aria-label="Gamepad axis deadzone"
                value={calibration.axisDeadzone}
                onChange={(e) => update({ axisDeadzone: Number(e.currentTarget.value) })}
              />
              <span style={{ textAlign: 'right' }}>{calibration.axisDeadzone.toFixed(2)}</span>
            </label>
            <label style={{ display: 'grid', gridTemplateColumns: '150px 1fr 38px', gap: 6, alignItems: 'center' }}>
              Trigger deadzone
              <input
                type="range" min={0} max={0.5} step={0.01}
                aria-label="Gamepad trigger deadzone"
                value={calibration.triggerDeadzone}
                onChange={(e) => update({ triggerDeadzone: Number(e.currentTarget.value) })}
              />
              <span style={{ textAlign: 'right' }}>{calibration.triggerDeadzone.toFixed(2)}</span>
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                aria-label="Invert elevator axis"
                checked={calibration.invertElevator}
                onChange={(e) => update({ invertElevator: e.currentTarget.checked })}
              />
              Invert elevator
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                aria-label="Invert aileron axis"
                checked={calibration.invertAileron}
                onChange={(e) => update({ invertAileron: e.currentTarget.checked })}
              />
              Invert aileron
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                aria-label="Invert rudder axis"
                checked={calibration.invertRudder}
                onChange={(e) => update({ invertRudder: e.currentTarget.checked })}
              />
              Invert rudder
            </label>
            <button
              type="button"
              aria-label="Reset gamepad calibration to defaults"
              onClick={() => update(DEFAULT_GAMEPAD_SETTINGS)}
              style={{ ...toggleButtonStyle, width: 'auto', textAlign: 'center', padding: '4px 8px' }}
            >
              Reset to defaults
            </button>
          </div>
          <div style={sectionHeadingStyle}>LIVE INPUT PREVIEW</div>
          <div data-testid="gamepad-preview" aria-label="Gamepad live input preview" style={{ color: '#cfe5ef' }}>
            {previewText(preview)}
          </div>
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
