import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Telemetry } from '../Telemetry';

describe('Telemetry', () => {
  it('renders ALT, TAS, HDG labels', () => {
    render(<Telemetry />);
    expect(screen.getByText(/ALT:/)).toBeTruthy();
    expect(screen.getByText(/TAS:/)).toBeTruthy();
    expect(screen.getByText(/HDG:/)).toBeTruthy();
  });
});
