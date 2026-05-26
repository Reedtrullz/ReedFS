import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ControlsSettings } from '../ControlsSettings';
import { DEFAULT_CONTROL_BINDINGS } from '../../input/controlBindings';

describe('ControlsSettings', () => {
  it('renders current keyboard and gamepad binding names', () => {
    render(<ControlsSettings bindings={DEFAULT_CONTROL_BINDINGS} />);

    expect(screen.getByRole('group', { name: 'Controls settings' })).toBeTruthy();
    expect(screen.getByText('Pitch')).toBeTruthy();
    expect(screen.getByText(/W\/S/)).toBeTruthy();
    expect(screen.getByText(/Gamepad left stick Y/)).toBeTruthy();
    expect(screen.getByText('Overlay')).toBeTruthy();
    expect(screen.getByText(/OVL button/)).toBeTruthy();
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
