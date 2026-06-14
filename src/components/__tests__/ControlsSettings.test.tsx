import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ControlsSettings } from '../ControlsSettings';
import { DEFAULT_CONTROL_BINDINGS } from '../../input/controlBindings';

describe('ControlsSettings', () => {
  it('starts collapsed so debug overlays do not cover the primary flight instruments', () => {
    render(<ControlsSettings bindings={DEFAULT_CONTROL_BINDINGS} />);

    expect(screen.getByRole('button', { name: 'Show controls settings' })).toBeTruthy();
    expect(screen.queryByText('Pitch')).toBeNull();
    expect(screen.getByText('Bindings valid.')).toBeTruthy();
  });

  it('renders current keyboard and gamepad binding names after expanding', () => {
    render(<ControlsSettings bindings={DEFAULT_CONTROL_BINDINGS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show controls settings' }));

    expect(screen.getByRole('group', { name: 'Controls settings' })).toBeTruthy();
    expect(screen.getByText('Pitch')).toBeTruthy();
    expect(screen.getByText(/W\/S/)).toBeTruthy();
    expect(screen.getByText(/Gamepad left stick Y/)).toBeTruthy();
    expect(screen.getByText('Overlay')).toBeTruthy();
    expect(screen.getByText(/O · Gamepad B\/Circle/)).toBeTruthy();
    expect(screen.getByText('Camera')).toBeTruthy();
    expect(screen.getByText(/C · Gamepad X\/Square/)).toBeTruthy();
    expect(screen.getByText('Gear')).toBeTruthy();
    expect(screen.getByText(/Gamepad RB\/R1/)).toBeTruthy();
    expect(screen.getByText('Differential brake')).toBeTruthy();
    expect(screen.getByText(/Z\/X/)).toBeTruthy();
    expect(screen.getByText('Audio')).toBeTruthy();
    expect(screen.getByText(/Gamepad Y\/Triangle/)).toBeTruthy();
    expect(screen.getByText('Simulator start/pause/reset')).toBeTruthy();
    expect(screen.getByText(/Gamepad Start\/Menu/)).toBeTruthy();
    expect(screen.getByText(/Gamepad Back\/View/)).toBeTruthy();
    expect(screen.getByText('MCP Flight Director')).toBeTruthy();
    expect(screen.getByText(/Gamepad L3/)).toBeTruthy();
    expect(screen.getByText('MCP heading mode')).toBeTruthy();
    expect(screen.getByText(/Gamepad R3/)).toBeTruthy();
    expect(screen.getByText('MCP altitude hold')).toBeTruthy();
    expect(screen.getByText(/Gamepad D-pad left/)).toBeTruthy();
    expect(screen.getByText('MCP speed mode')).toBeTruthy();
    expect(screen.getByText(/Gamepad D-pad right/)).toBeTruthy();
    expect(screen.getAllByText(/edge-triggered/i).length).toBeGreaterThan(3);
  });

  it('shows validation problems for duplicate bindings', () => {
    const duplicate = DEFAULT_CONTROL_BINDINGS.map((binding) => (
      binding.id === 'roll'
        ? { ...binding, keyboard: ['W/S'] }
        : binding
    ));

    render(<ControlsSettings bindings={duplicate} />);

    expect(screen.getByText(/duplicate/i)).toBeTruthy();
  });
});
