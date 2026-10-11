import type { ReactNode } from 'react';
import { WORKSPACE_MODES, type WorkspaceMode } from './workspaceMode';

export interface RfsLayoutProps {
  viewport: ReactNode;
  sceneLayers?: ReactNode;
  debugPanels?: ReactNode;
  flightInstruments?: ReactNode;
  sceneStatus?: ReactNode;
  scenarioPanel?: ReactNode;
  routeBuilderPanel?: ReactNode;
  routeStatus?: ReactNode;
  takeoffSetupPanel?: ReactNode;
  engineStrip?: ReactNode;
  controls?: ReactNode;
  buildWatermark?: ReactNode;
  fpsMonitor?: ReactNode;
  workspaceMode: WorkspaceMode;
  onChangeWorkspaceMode: (mode: WorkspaceMode) => void;
  setupDockOpen: boolean;
  onToggleSetupDock: () => void;
}

export function RfsLayout({
  viewport,
  sceneLayers,
  debugPanels,
  flightInstruments,
  sceneStatus,
  scenarioPanel,
  routeBuilderPanel,
  routeStatus,
  takeoffSetupPanel,
  engineStrip,
  controls,
  buildWatermark,
  fpsMonitor,
  workspaceMode,
  onChangeWorkspaceMode,
  setupDockOpen,
  onToggleSetupDock,
}: RfsLayoutProps) {
  const hasSetupPanels = Boolean(scenarioPanel || routeBuilderPanel || takeoffSetupPanel);
  const setupDockVisible = setupDockOpen && hasSetupPanels;

  return (
    <main
      className="rfs-layout"
      data-testid="rfs-layout"
      data-workspace={workspaceMode}
      aria-labelledby="rfs-simulator-heading"
    >
      <style>{layoutCss}</style>
      <h1 id="rfs-simulator-heading" className="rfs-layout__heading">Reed Flight Simulator</h1>

      <header className="rfs-layout__topbar">
        <nav className="rfs-layout__workspaces" role="group" aria-label="Workspace modes">
          {WORKSPACE_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`rfs-layout__workspace-tab${workspaceMode === mode.id ? ' rfs-layout__workspace-tab--active' : ''}`}
              aria-pressed={workspaceMode === mode.id}
              data-rfs-workspace={mode.id}
              onClick={() => onChangeWorkspaceMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </nav>
        {hasSetupPanels && (
          <button
            type="button"
            className={`rfs-layout__dock-toggle${setupDockOpen ? ' rfs-layout__dock-toggle--active' : ''}`}
            aria-expanded={setupDockOpen}
            data-rfs-panel="dock-toggle"
            onClick={onToggleSetupDock}
          >
            Setup
          </button>
        )}
      </header>

      <div className="rfs-layout__scene" data-rfs-layer="scene">
        {viewport}
        {sceneLayers}
      </div>

      {setupDockVisible && (
        <aside className="rfs-layout__dock" data-rfs-zone="setup-dock" aria-label="Setup dock">
          {scenarioPanel && <div data-rfs-panel="scenario">{scenarioPanel}</div>}
          {routeBuilderPanel && <div data-rfs-panel="route-builder">{routeBuilderPanel}</div>}
          {takeoffSetupPanel && <div data-rfs-panel="takeoff-setup">{takeoffSetupPanel}</div>}
        </aside>
      )}

      {(sceneStatus || routeStatus) && (
        <div className="rfs-layout__top-right" data-rfs-zone="top-right">
          {sceneStatus && <div data-rfs-panel="scene-status">{sceneStatus}</div>}
          {routeStatus && <div data-rfs-panel="route">{routeStatus}</div>}
        </div>
      )}

      {debugPanels && (
        <div className="rfs-layout__debug" data-rfs-zone="debug" data-rfs-panel="debug" role="region" aria-label="Debug overlays">
          {debugPanels}
        </div>
      )}

      {(engineStrip || flightInstruments) && (
        <div className="rfs-layout__bottom-right" data-rfs-zone="bottom-right">
          {flightInstruments && (
            <div className="rfs-layout__instrument-row" data-rfs-zone="flight-instruments">
              {flightInstruments}
            </div>
          )}
          {engineStrip && <div data-rfs-panel="engine">{engineStrip}</div>}
        </div>
      )}

      {controls && (
        <div className="rfs-layout__controls" data-rfs-panel="controls" role="region" aria-label="Simulator controls">
          {controls}
        </div>
      )}
      {buildWatermark && <div className="rfs-layout__watermark" data-rfs-panel="build-watermark">{buildWatermark}</div>}
      {fpsMonitor && <div className="rfs-layout__fps" data-rfs-panel="fps">{fpsMonitor}</div>}
    </main>
  );
}

const layoutCss = `
.rfs-layout {
  --rfs-color-surface: rgba(10, 12, 10, 0.88);
  --rfs-color-surface-raised: rgba(18, 22, 18, 0.94);
  --rfs-color-border: rgba(255, 255, 255, 0.16);
  --rfs-color-border-strong: rgba(255, 255, 255, 0.32);
  --rfs-color-text: rgba(240, 244, 240, 0.92);
  --rfs-color-text-muted: rgba(240, 244, 240, 0.6);
  --rfs-color-ok: #35c26a;
  --rfs-color-warn: #d9a13b;
  --rfs-color-critical: #d84a4a;
  --rfs-space-1: 4px;
  --rfs-space-2: 8px;
  --rfs-space-3: 12px;
  --rfs-radius-sm: 4px;
  --rfs-radius-md: 6px;
  --rfs-font-ui: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000;
  color: var(--rfs-color-text);
  font-family: var(--rfs-font-ui);
  isolation: isolate;
}

.rfs-layout__heading {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.rfs-layout__scene {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.rfs-layout .cesium-viewer-bottom,
.rfs-layout .cesium-widget-credits {
  z-index: 120;
}

.rfs-layout [data-rfs-panel] {
  box-sizing: border-box;
  pointer-events: auto;
  z-index: 170;
}

.rfs-layout [data-rfs-panel] > *,
.rfs-layout [data-rfs-debug-panel] > :not(dialog) {
  position: static !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  transform: none !important;
  box-sizing: border-box;
  max-width: 100%;
}

.rfs-layout__topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rfs-space-3);
  padding: 0 var(--rfs-space-3);
  background: var(--rfs-color-surface);
  border-bottom: 1px solid var(--rfs-color-border);
  pointer-events: auto;
  z-index: 190;
}

.rfs-layout__workspaces {
  display: flex;
  align-items: center;
  gap: var(--rfs-space-2);
}

.rfs-layout__workspace-tab,
.rfs-layout__dock-toggle {
  appearance: none;
  border: 1px solid var(--rfs-color-border);
  border-radius: var(--rfs-radius-sm);
  background: transparent;
  color: var(--rfs-color-text-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 5px 12px;
  cursor: pointer;
}

.rfs-layout__workspace-tab:hover,
.rfs-layout__dock-toggle:hover {
  border-color: var(--rfs-color-border-strong);
  color: var(--rfs-color-text);
}

.rfs-layout__workspace-tab--active,
.rfs-layout__dock-toggle--active {
  border-color: var(--rfs-color-ok);
  color: var(--rfs-color-ok);
}

.rfs-layout__dock {
  position: absolute;
  top: 58px;
  left: 14px;
  width: clamp(272px, 24vw, 330px);
  max-height: calc(100vh - 320px);
  display: flex;
  flex-direction: column;
  gap: var(--rfs-space-3);
  overflow: auto;
  pointer-events: none;
  z-index: 170;
}

.rfs-layout__dock > [data-rfs-panel] {
  pointer-events: auto;
  flex: 0 0 auto;
}

.rfs-layout__dock > [data-rfs-panel] > * {
  width: 100% !important;
}

.rfs-layout__dock [data-rfs-panel="scenario"] {
  max-height: clamp(120px, calc(100vh - 580px), 220px);
  overflow: auto;
}

.rfs-layout__dock [data-rfs-panel="route-builder"] {
  max-height: clamp(90px, calc(100vh - 700px), 130px);
  overflow: auto;
}

.rfs-layout__dock [data-rfs-panel="takeoff-setup"] {
  max-height: clamp(90px, calc(100vh - 700px), 130px);
  overflow: auto;
}

.rfs-layout__top-right {
  position: absolute;
  top: 58px;
  right: 14px;
  width: 260px;
  display: grid;
  gap: var(--rfs-space-3);
  pointer-events: none;
  z-index: 170;
}

.rfs-layout__top-right [data-rfs-panel] > * {
  width: 100% !important;
}

.rfs-layout__debug {
  position: absolute;
  top: 58px;
  left: min(680px, calc(100vw - 600px));
  width: min(300px, calc(100vw - 980px));
  min-width: 240px;
  display: grid;
  gap: 10px;
  height: min(380px, calc(100vh - 220px));
  overflow: auto;
  pointer-events: auto;
  z-index: 175;
}

.rfs-layout__debug > * {
  width: 100% !important;
}

.rfs-layout__debug [data-rfs-debug-panel] {
  box-sizing: border-box;
  width: 100%;
}

.rfs-layout__bottom-right {
  position: absolute;
  right: 14px;
  bottom: 32px;
  width: min(74vw, 760px);
  display: grid;
  gap: 10px;
  justify-items: end;
  pointer-events: none;
  z-index: 165;
}

.rfs-layout__instrument-row {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 12px;
  max-width: 100%;
  pointer-events: none;
}

.rfs-layout__instrument-row [data-rfs-panel="pfd"] {
  width: min(492px, 48vw);
}

.rfs-layout__instrument-row [data-rfs-panel="mcp"] {
  width: 252px;
}

.rfs-layout__instrument-row [data-rfs-panel="pfd"] > *,
.rfs-layout__instrument-row [data-rfs-panel="mcp"] > * {
  width: 100% !important;
}

.rfs-layout [data-rfs-panel="engine"] {
  max-width: 100%;
}

.rfs-layout [data-rfs-panel="engine"] > * {
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.rfs-layout__controls {
  position: absolute;
  left: 14px;
  bottom: 32px;
  width: 220px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  z-index: 180;
}

.rfs-layout__controls > * {
  position: static !important;
  width: 100% !important;
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
}

.rfs-layout__watermark {
  position: absolute;
  left: 14px;
  bottom: 154px;
  color: var(--rfs-color-ok);
  font-family: monospace;
  font-size: 10px;
  opacity: 0.5;
  pointer-events: none;
  z-index: 90;
}

.rfs-layout__fps {
  position: absolute;
  left: 14px;
  top: calc(100vh - 210px);
  z-index: 175;
}

@media (min-width: 1280px) {
  .rfs-layout__controls {
    width: 440px;
  }
}

@media (max-width: 1360px) {
  .rfs-layout__dock {
    width: min(330px, calc(100vw - 300px));
  }

  .rfs-layout__dock [data-rfs-panel="scenario"] {
    max-height: clamp(120px, calc(100vh - 640px), 170px);
  }

  .rfs-layout__dock [data-rfs-panel="route-builder"] {
    max-height: clamp(90px, calc(100vh - 700px), 140px);
  }

  .rfs-layout__dock [data-rfs-panel="takeoff-setup"] {
    max-height: clamp(90px, calc(100vh - 700px), 180px);
  }
}

@media (min-width: 1440px) {
  .rfs-layout__controls {
    width: 560px;
  }

  .rfs-layout__bottom-right {
    width: min(80vw, 860px);
  }
}

@media (min-width: 1800px) {
  .rfs-layout__controls {
    width: 720px;
  }
}

@media (max-width: 1100px), (max-height: 760px) {
  .rfs-layout__dock {
    top: 50px;
    left: 8px;
    width: clamp(272px, 31vw, 284px);
    max-height: calc(100vh - 410px);
    gap: var(--rfs-space-2);
  }

  .rfs-layout__dock [data-rfs-panel="scenario"] {
    max-height: clamp(80px, calc(100vh - 632px), 118px);
  }

  .rfs-layout__dock [data-rfs-panel="route-builder"] {
    max-height: clamp(90px, calc(100vh - 620px), 100px);
  }

  .rfs-layout__dock [data-rfs-panel="takeoff-setup"] {
    max-height: clamp(90px, calc(100vh - 620px), 100px);
  }

  .rfs-layout__top-right {
    top: 50px;
    right: 8px;
    width: 220px;
    max-height: clamp(122px, calc(100vh - 560px), 190px);
    gap: 8px;
    overflow: auto;
  }

  .rfs-layout__top-right [data-rfs-panel] {
    max-height: clamp(122px, calc(100vh - 560px), 190px);
    overflow: auto;
  }

  .rfs-layout__debug {
    top: 50px;
    left: calc(8px + clamp(272px, 31vw, 284px) + 8px);
    width: max(220px, calc(100vw - clamp(272px, 31vw, 284px) - 492px));
    min-width: 0;
    max-width: calc(100vw - clamp(272px, 31vw, 284px) - 492px);
    height: 132px;
  }

  .rfs-layout__bottom-right {
    right: 8px;
    bottom: 32px;
    width: min(65vw, 592px);
    gap: 8px;
  }

  .rfs-layout__instrument-row {
    gap: 8px;
  }

  .rfs-layout__instrument-row [data-rfs-panel="pfd"] {
    width: min(360px, calc(100vw - 540px));
    min-width: 332px;
  }

  .rfs-layout__instrument-row [data-rfs-panel="mcp"] {
    width: 216px;
  }

  .rfs-layout [data-rfs-panel="engine"] > * {
    gap: 6px !important;
    padding: 6px 8px !important;
  }

  .rfs-layout__controls {
    left: 8px;
    bottom: 32px;
    width: clamp(260px, calc(100vw - 620px), 280px);
    gap: 6px;
  }

  .rfs-layout__controls > * {
    gap: 6px !important;
  }

  .rfs-layout__watermark {
    left: 8px;
    bottom: 168px;
  }

  .rfs-layout__fps {
    left: 8px;
    top: calc(100vh - 198px);
  }
}
`;
