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
    expect(screen.getByText('O')).toBeTruthy();
    expect(screen.getByText('Camera')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
    expect(screen.getByText('Gear')).toBeTruthy();
    expect(screen.getByText(/Gamepad RB\/R1/)).toBeTruthy();
    expect(screen.getByText('Differential brake')).toBeTruthy();
    expect(screen.getByText(/Z\/X/)).toBeTruthy();
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
