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
    expect(screen.getByRole('main', { name: 'Reed Flight Simulator' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reed Flight Simulator', level: 1 })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Simulator controls' })).toBeTruthy();
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
    expect(css).toContain('.rfs-layout [data-rfs-debug-panel] > *');
  });

  it('keeps Cesium attribution above scene canvases but below product panels', () => {
    render(<RfsLayout viewport={<div />} controls={<div>controls</div>} />);

    const css = Array.from(document.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n');
    expect(css).toContain('.rfs-layout .cesium-viewer-bottom');
    expect(css).toContain('.rfs-layout .cesium-widget-credits');
    expect(css).toMatch(/\.rfs-layout \.cesium-viewer-bottom,\s*\.rfs-layout \.cesium-widget-credits\s*\{[^}]*z-index:\s*120;/s);
    expect(css).toMatch(/\.rfs-layout \[data-rfs-panel\]\s*\{[^}]*z-index:\s*170;/s);
  });

  it('exposes debug overlays as a bounded opt-in zone', () => {
    render(
      <RfsLayout
        viewport={<div />}
        debugPanels={<div data-rfs-debug-panel="telemetry">debug</div>}
      />,
    );

    expect(screen.getByRole('region', { name: 'Debug overlays' })).toBeTruthy();
    expect(document.querySelector('[data-rfs-zone="debug"]')).toBeTruthy();
    expect(document.querySelector('[data-rfs-panel="debug"]')).toBeTruthy();
    expect(document.querySelector('[data-rfs-debug-panel="telemetry"]')).toBeTruthy();
  });

  it('documents the narrow viewport stack that keeps top-left panels clear of instruments', () => {
    render(<RfsLayout viewport={<div />} scenarioPanel={<div>scenario</div>} takeoffSetupPanel={<div>takeoff</div>} />);

    const css = Array.from(document.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n');
    expect(css).toContain('@media (max-width: 1360px)');
    expect(css).toMatch(/\.rfs-layout__top-left\s*\{[^}]*flex-direction:\s*column;/s);
    expect(css).toMatch(/\[data-rfs-panel="scenario"\]\s*\{[^}]*max-height:\s*clamp\(160px, calc\(100vh - 520px\), 200px\);/s);
    expect(css).toMatch(/\[data-rfs-panel="takeoff-setup"\]\s*\{[^}]*max-height:\s*clamp\(160px, calc\(100vh - 520px\), 200px\);/s);
    expect(css).toMatch(/\[data-rfs-panel="takeoff-setup"\]\s*\{[^}]*overflow:\s*auto;/s);
  });
});
