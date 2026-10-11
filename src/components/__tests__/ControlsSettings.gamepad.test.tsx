import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { ControlsSettings } from '../ControlsSettings';
import { DEFAULT_GAMEPAD_SETTINGS, type GamepadSettingsState } from '../../input/gamepadSettings';

const originalGetGamepadsDescriptor = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');

function setGamepads(gamepads: Array<Partial<Gamepad> | null>): void {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: vi.fn(() => gamepads as Gamepad[]),
  });
}

function mount(settings: GamepadSettingsState | undefined, onChange?: (s: GamepadSettingsState) => void) {
  return render(createElement(ControlsSettings, { gamepadSettings: settings, onGamepadSettingsChange: onChange }));
}

describe('ControlsSettings gamepad calibration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGetGamepadsDescriptor) {
      Object.defineProperty(navigator, 'getGamepads', originalGetGamepadsDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'getGamepads');
    }
  });

  it('changes state on control input and shows a live preview', () => {
    setGamepads([{ axes: [0.5, -0.25, 0.75], buttons: [] }]);
    const changes: GamepadSettingsState[] = [];
    const onGamepadSettingsChange = (s: GamepadSettingsState) => { changes.push(s); };
    mount(DEFAULT_GAMEPAD_SETTINGS, onGamepadSettingsChange);
    fireEvent.click(screen.getByRole('button', { name: 'Show controls settings' }));
    fireEvent.change(screen.getByLabelText('Gamepad axis deadzone'), { target: { value: '0.2' } });
    expect(changes.at(-1)?.axisDeadzone).toBe(0.2);
    fireEvent.click(screen.getByLabelText('Invert elevator axis'));
    expect(changes.at(-1)?.invertElevator).toBe(true);
    expect(screen.getByTestId('gamepad-preview').textContent).toMatch(/Pitch/);
  });

  it('resets to defaults from changed state', () => {
    const changed: GamepadSettingsState = { ...DEFAULT_GAMEPAD_SETTINGS, axisDeadzone: 0.4, invertRudder: true };
    const changes: GamepadSettingsState[] = [];
    const onGamepadSettingsChange = (s: GamepadSettingsState) => { changes.push(s); };
    mount(changed, onGamepadSettingsChange);
    fireEvent.click(screen.getByRole('button', { name: 'Show controls settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset gamepad calibration to defaults' }));
    expect(changes.at(-1)).toEqual(DEFAULT_GAMEPAD_SETTINGS);
  });

  it('renders binding names without calibration controls when handlers are absent', () => {
    mount(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Show controls settings' }));
    expect(screen.getByText('Pitch')).toBeTruthy();
    expect(screen.queryByText('GAMEPAD CALIBRATION')).toBeNull();
  });
});
