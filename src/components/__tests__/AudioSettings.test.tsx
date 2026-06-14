import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AUDIO_SETTINGS, loadAudioSettings, saveAudioSettings, type AudioSettingsStorage } from '../../audio/audioSettings';
import { AudioSettings } from '../AudioSettings';

function memoryStorage(initial: Record<string, string> = {}): AudioSettingsStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
  };
}

describe('audio settings persistence and UI', () => {
  it('persists versioned master volume, mute, and caption preferences', () => {
    const storage = memoryStorage();

    saveAudioSettings({ version: 1, masterVolume: 0.32, muted: true, captionsEnabled: false }, storage);

    expect(loadAudioSettings(storage)).toEqual({
      version: 1,
      masterVolume: 0.32,
      muted: true,
      captionsEnabled: false,
    });
  });

  it('falls back to safe caption-on defaults for malformed stored settings', () => {
    const storage = memoryStorage({ 'rfs.audioSettings.v1': '{"version":1,"masterVolume":2,"muted":"nope","captionsEnabled":false}' });

    expect(loadAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('renders controls that update volume, mute, and captions', () => {
    const onSettingsChange = vi.fn();
    render(
      <AudioSettings
        settings={{ version: 1, masterVolume: 0.5, muted: false, captionsEnabled: true }}
        audioStatus="off"
        onSettingsChange={onSettingsChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /audio settings/i }));
    fireEvent.change(screen.getByRole('slider', { name: /master volume/i }), { target: { value: '0.25' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /mute audio/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /show audio captions/i }));

    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ masterVolume: 0.25 }));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ muted: true }));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ captionsEnabled: false }));
  });

  it('shows visible blocked-audio recovery help while keeping captions available', () => {
    render(
      <AudioSettings
        settings={{ version: 1, masterVolume: 0.5, muted: false, captionsEnabled: true }}
        audioStatus="blocked"
        onSettingsChange={vi.fn()}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/audio blocked/i);
    expect(alert.textContent).toMatch(/browser.*site settings|user gesture|try again/i);
    expect(alert.textContent).toMatch(/captions.*without sound/i);
  });
});
