import { useState } from 'react';
import type { AudioUiStatus } from './BottomControlBar';
import type { AudioSettingsState } from '../audio/audioSettings';

export interface AudioSettingsProps {
  settings: AudioSettingsState;
  audioStatus: AudioUiStatus;
  onSettingsChange: (settings: AudioSettingsState) => void;
}

export function AudioSettings({ settings, audioStatus, onSettingsChange }: AudioSettingsProps) {
  const [expanded, setExpanded] = useState(false);
  const volumePercent = Math.round(settings.masterVolume * 100);

  const update = (partial: Partial<AudioSettingsState>) => {
    onSettingsChange({ ...settings, ...partial, version: 1 });
  };

  return (
    <section aria-label="Audio settings" style={panelStyle}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="rfs-audio-settings-panel"
        onClick={() => setExpanded((value) => !value)}
        style={toggleStyle}
      >
        Audio settings {expanded ? '▾' : '▸'}
      </button>

      {audioStatus === 'blocked' && (
        <div role="alert" style={blockedStyle}>
          Audio blocked. Browser autoplay or site settings prevented sound after the user gesture; check browser site settings and try again. Audio captions remain available without sound.
        </div>
      )}

      {expanded && (
        <div id="rfs-audio-settings-panel" style={contentStyle}>
          <label style={rowStyle}>
            <span>Master volume</span>
            <input
              aria-label="Master volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.masterVolume}
              onChange={(event) => update({ masterVolume: Number(event.currentTarget.value) })}
            />
            <span aria-label="Master volume readback">{volumePercent}%</span>
          </label>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(event) => update({ muted: event.currentTarget.checked })}
            />
            Mute audio
          </label>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={settings.captionsEnabled}
              onChange={(event) => update({ captionsEnabled: event.currentTarget.checked })}
            />
            Show audio captions
          </label>
        </div>
      )}
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(0, 20, 0, 0.82)',
  border: '1px solid rgba(0,255,0,0.65)',
  borderRadius: 4,
  color: '#bfffbf',
  fontFamily: 'monospace',
  fontSize: 11,
  padding: 6,
  display: 'grid',
  gap: 6,
};

const toggleStyle: React.CSSProperties = {
  background: 'rgba(0,255,0,0.16)',
  border: '1px solid rgba(0,255,0,0.55)',
  color: '#0f0',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 11,
  padding: '4px 6px',
  textAlign: 'left',
};

const contentStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const blockedStyle: React.CSSProperties = {
  background: 'rgba(255, 183, 77, 0.16)',
  border: '1px solid rgba(255,183,77,0.8)',
  borderRadius: 4,
  color: '#ffcf88',
  lineHeight: 1.35,
  padding: 6,
};
