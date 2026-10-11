import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RfsLayout } from '../RfsLayout';

function renderLayout(overrides: Partial<Parameters<typeof RfsLayout>[0]> = {}) {
  return render(
    <RfsLayout
      viewport={<div data-testid="viewport">viewport</div>}
      workspaceMode="flight"
      onChangeWorkspaceMode={() => {}}
      setupDockOpen={false}
      onToggleSetupDock={() => {}}
      {...overrides}
    />,
  );
}

describe('RfsLayout', () => {
  afterEach(() => cleanup());

  it('renders named product panels around the scene surface', () => {
    renderLayout({
      scenarioPanel: <div>scenario</div>,
      routeBuilderPanel: <div>route builder</div>,
      takeoffSetupPanel: <div>takeoff</div>,
      routeStatus: <div>route</div>,
      flightInstruments: (
        <>
          <div data-rfs-panel="pfd">pfd</div>
          <div data-rfs-panel="mcp">mcp</div>
        </>
      ),
      engineStrip: <div>engine</div>,
      controls: <div>controls</div>,
      setupDockOpen: true,
    });

    expect(screen.getByTestId('viewport')).toBeTruthy();
    expect(screen.getByRole('main', { name: 'Reed Flight Simulator' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reed Flight Simulator', level: 1 })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Simulator controls' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Setup dock' })).toBeTruthy();
    for (const panel of ['scenario', 'route-builder', 'takeoff-setup', 'route', 'pfd', 'mcp', 'engine', 'controls']) {
      expect(document.querySelector(`[data-rfs-panel="${panel}"]`)).toBeTruthy();
    }
  });

  it('renders the workspace mode strip with Briefing, Flight and Debrief', () => {
    const onChange = vi.fn();
    renderLayout({ onChangeWorkspaceMode: onChange });

    expect(screen.getByRole('group', { name: 'Workspace modes' })).toBeTruthy();
    for (const mode of ['briefing', 'flight', 'debrief']) {
      expect(document.querySelector(`[data-rfs-workspace="${mode}"]`)).toBeTruthy();
    }
    expect(document.querySelector('[data-rfs-workspace="flight"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles the setup dock from the header control', () => {
    const onToggle = vi.fn();
    renderLayout({ scenarioPanel: <div>scenario</div>, onToggleSetupDock: onToggle });

    expect(document.querySelector('[data-rfs-zone="setup-dock"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('keeps setup panels mounted in the dock only while it is open', () => {
    const { rerender } = renderLayout({ scenarioPanel: <div>scenario</div>, setupDockOpen: true });
    expect(document.querySelector('[data-rfs-panel="scenario"]')).toBeTruthy();
    rerender(
      <RfsLayout
        viewport={<div />}
        workspaceMode="flight"
        onChangeWorkspaceMode={() => {}}
        setupDockOpen={false}
        onToggleSetupDock={() => {}}
        scenarioPanel={<div>scenario</div>}
      />,
    );
    expect(document.querySelector('[data-rfs-panel="scenario"]')).toBeNull();
  });

  it('documents the direct-child fixed-position override used to keep legacy panels inside layout slots', () => {
    renderLayout({ controls: <div>controls</div> });

    const css = Array.from(document.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n');
    expect(css).toContain('.rfs-layout [data-rfs-panel] > *');
    expect(css).toContain('position: static !important');
    expect(css).toContain('bottom: auto !important');
    expect(css).toContain('.rfs-layout [data-rfs-debug-panel] > :not(dialog)');
  });

  it('keeps Cesium attribution above scene canvases but below product panels', () => {
    renderLayout({ controls: <div>controls</div> });

    const css = Array.from(document.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n');
    expect(css).toContain('.rfs-layout .cesium-viewer-bottom');
    expect(css).toContain('.rfs-layout .cesium-widget-credits');
    expect(css).toMatch(/\.rfs-layout \.cesium-viewer-bottom,\s*\.rfs-layout \.cesium-widget-credits\s*\{[^}]*z-index:\s*120;/s);
    expect(css).toMatch(/\.rfs-layout \[data-rfs-panel\]\s*\{[^}]*z-index:\s*170;/s);
  });

  it('exposes debug overlays as a bounded opt-in zone', () => {
    renderLayout({ debugPanels: <div data-rfs-debug-panel="telemetry">debug</div> });

    expect(screen.getByRole('region', { name: 'Debug overlays' })).toBeTruthy();
    expect(document.querySelector('[data-rfs-zone="debug"]')).toBeTruthy();
    expect(document.querySelector('[data-rfs-panel="debug"]')).toBeTruthy();
    expect(document.querySelector('[data-rfs-debug-panel="telemetry"]')).toBeTruthy();
  });

  it('defines shared workspace tokens for surface, semantic status and spacing', () => {
    renderLayout({});

    const css = Array.from(document.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n');
    for (const token of ['--rfs-color-surface', '--rfs-color-ok', '--rfs-color-warn', '--rfs-color-critical', '--rfs-space-2']) {
      expect(css).toContain(token);
    }
  });

  it('documents the compact cockpit breakpoint that keeps the dock and instruments clear', () => {
    renderLayout({ scenarioPanel: <div>scenario</div> });

    const css = Array.from(document.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n');
    expect(css).toContain('@media (max-width: 1100px), (max-height: 760px)');
    expect(css).toMatch(/\.rfs-layout__dock\s*\{[^}]*width:\s*clamp\(272px, 31vw, 284px\);/s);
    expect(css).toMatch(/\.rfs-layout__top-right\s*\{[^}]*width:\s*220px;/s);
    expect(css).toMatch(/\.rfs-layout__bottom-right\s*\{[^}]*width:\s*min\(65vw, 592px\);/s);
    expect(css).toMatch(/\[data-rfs-panel="pfd"\]\s*\{[^}]*width:\s*min\(360px, calc\(100vw - 540px\)\);/s);
    expect(css).toMatch(/\[data-rfs-panel="mcp"\]\s*\{[^}]*width:\s*216px;/s);
    expect(css).toMatch(/\.rfs-layout__controls\s*\{[^}]*width:\s*clamp\(260px, calc\(100vw - 620px\), 280px\);/s);
  });
});
