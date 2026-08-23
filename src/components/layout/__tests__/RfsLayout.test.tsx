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
        routeBuilderPanel={<div>route builder</div>}
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
    for (const panel of ['scenario', 'route-builder', 'takeoff-setup', 'route', 'pfd', 'mcp', 'engine', 'controls']) {
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
    render(<RfsLayout viewport={<div />} scenarioPanel={<div>scenario</div>} routeBuilderPanel={<div>route builder</div>} takeoffSetupPanel={<div>takeoff</div>} />);

    const css = Array.from(document.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n');
    expect(css).toContain('@media (max-width: 1360px)');
    expect(css).toMatch(/\.rfs-layout__top-left\s*\{[^}]*flex-direction:\s*column;/s);
    expect(css).toMatch(/\[data-rfs-panel="scenario"\]\s*\{[^}]*max-height:\s*clamp\(130px, calc\(100vh - 560px\), 180px\);/s);
    expect(css).toMatch(/\[data-rfs-panel="route-builder"\]\s*\{[^}]*max-height:\s*clamp\(112px, calc\(100vh - 570px\), 160px\);/s);
    expect(css).toMatch(/\[data-rfs-panel="route-builder"\]\s*\{[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(/\[data-rfs-panel="takeoff-setup"\]\s*\{[^}]*max-height:\s*clamp\(150px, calc\(100vh - 560px\), 200px\);/s);
    expect(css).toMatch(/\[data-rfs-panel="takeoff-setup"\]\s*\{[^}]*overflow:\s*auto;/s);
  });

  it('documents the compact cockpit breakpoint for short or narrow flight viewports', () => {
    render(
      <RfsLayout
        viewport={<div />}
        scenarioPanel={<div>scenario</div>}
        routeBuilderPanel={<div>route builder</div>}
        takeoffSetupPanel={<div>takeoff</div>}
        routeStatus={<div>route</div>}
        flightInstruments={(
          <>
            <div data-rfs-panel="pfd">pfd</div>
            <div data-rfs-panel="mcp">mcp</div>
          </>
        )}
        controls={<div>controls</div>}
      />,
    );

    const css = Array.from(document.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n');
    expect(css).toContain('@media (max-width: 1100px), (max-height: 760px)');
    expect(css).toMatch(/\.rfs-layout__top-left\s*\{[^}]*width:\s*clamp\(272px, 31vw, 284px\);/s);
    expect(css).toMatch(/\.rfs-layout__top-left\s*\{[^}]*max-height:\s*calc\(100vh - 256px\);/s);
    expect(css).toMatch(/\[data-rfs-panel="route-builder"\]\s*\{[^}]*max-height:\s*clamp\(112px, calc\(100vh - 590px\), 132px\);/s);
    expect(css).toMatch(/\.rfs-layout__top-right\s*\{[^}]*width:\s*240px;/s);
    expect(css).toMatch(/\.rfs-layout__top-right \[data-rfs-panel\]\s*\{[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(/\.rfs-layout__bottom-right\s*\{[^}]*width:\s*min\(65vw, 592px\);/s);
    expect(css).toMatch(/\[data-rfs-panel="pfd"\]\s*\{[^}]*width:\s*min\(360px, calc\(100vw - 540px\)\);/s);
    expect(css).toMatch(/\[data-rfs-panel="mcp"\]\s*\{[^}]*width:\s*216px;/s);
    expect(css).toMatch(/\.rfs-layout__controls\s*\{[^}]*width:\s*clamp\(260px, calc\(100vw - 620px\), 280px\);/s);
  });
});
