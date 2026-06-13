import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RfsLayout } from '../RfsLayout';

describe('RfsLayout', () => {
  afterEach(() => cleanup());

  it('renders named product panels around the scene surface', () => {
    render(
      <RfsLayout
        viewport={<div data-testid="viewport">viewport</div>}
        scenarioPanel={<div>scenario</div>}
        takeoffSetupPanel={<div>takeoff</div>}
        routeStatus={<div>route</div>}
        flightInstruments={(
          <>
            <div data-rfs-panel="pfd">pfd</div>
            <div data-rfs-panel="mcp">mcp</div>
          </>
        )}
        engineStrip={<div>engine</div>}
        controls={<div>controls</div>}
      />,
    );

    expect(screen.getByTestId('viewport')).toBeTruthy();
    for (const panel of ['scenario', 'takeoff-setup', 'route', 'pfd', 'mcp', 'engine', 'controls']) {
      expect(document.querySelector(`[data-rfs-panel="${panel}"]`)).toBeTruthy();
    }
  });

  it('documents the direct-child fixed-position override used to keep legacy panels inside layout slots', () => {
    render(<RfsLayout viewport={<div />} controls={<div>controls</div>} />);

    const css = Array.from(document.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n');
    expect(css).toContain('.rfs-layout [data-rfs-panel] > *');
    expect(css).toContain('position: static !important');
    expect(css).toContain('bottom: auto !important');
  });
});
