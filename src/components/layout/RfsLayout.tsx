import type { ReactNode } from 'react';

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
}: RfsLayoutProps) {
  return (
    <main className="rfs-layout" data-testid="rfs-layout" aria-labelledby="rfs-simulator-heading">
      <style>{layoutCss}</style>
      <h1 id="rfs-simulator-heading" className="rfs-layout__heading">Reed Flight Simulator</h1>
      <div className="rfs-layout__scene" data-rfs-layer="scene">
        {viewport}
        {sceneLayers}
      </div>

      {(scenarioPanel || routeBuilderPanel || takeoffSetupPanel) && (
        <div className="rfs-layout__top-left" data-rfs-zone="top-left">
          {scenarioPanel && <div data-rfs-panel="scenario">{scenarioPanel}</div>}
          {routeBuilderPanel && <div data-rfs-panel="route-builder">{routeBuilderPanel}</div>}
          {takeoffSetupPanel && <div data-rfs-panel="takeoff-setup">{takeoffSetupPanel}</div>}
        </div>
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
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000;
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
.rfs-layout [data-rfs-debug-panel] > * {
  position: static !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  transform: none !important;
  box-sizing: border-box;
  max-width: 100%;
}

.rfs-layout__top-left {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 300px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  pointer-events: none;
  z-index: 170;
}

.rfs-layout__top-left [data-rfs-panel="scenario"] {
  flex: 0 1 clamp(280px, 24vw, 330px);
  width: clamp(280px, 24vw, 330px);
  max-height: min(560px, calc(100vh - 380px));
  overflow: auto;
}

.rfs-layout__top-left [data-rfs-panel="takeoff-setup"] {
  flex: 0 0 300px;
  width: min(300px, 32vw);
}

.rfs-layout__top-left [data-rfs-panel="scenario"] > *,
.rfs-layout__top-left [data-rfs-panel="route-builder"] > *,
.rfs-layout__top-left [data-rfs-panel="takeoff-setup"] > * {
  width: 100% !important;
}

.rfs-layout__top-right {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 260px;
  display: grid;
  gap: 12px;
  pointer-events: none;
  z-index: 170;
}

.rfs-layout__top-right [data-rfs-panel] > * {
  width: 100% !important;
}

.rfs-layout__debug {
  position: absolute;
  top: 14px;
  left: min(680px, calc(100vw - 600px));
  width: min(300px, calc(100vw - 980px));
  min-width: 240px;
  display: grid;
  gap: 10px;
  height: min(380px, calc(100vh - 180px));
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
  color: #0f0;
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

@media (max-width: 1279px) {
  .rfs-layout__instrument-row [data-rfs-panel="pfd"] {
    width: min(430px, 42vw);
  }

  .rfs-layout__debug {
    top: 254px;
    left: 356px;
    width: min(300px, calc(100vw - 724px));
    min-width: 240px;
    height: 150px;
  }
}

@media (min-width: 1280px) {
  .rfs-layout__controls {
    width: 440px;
  }
}

@media (max-width: 1360px) {
  .rfs-layout__top-left {
    right: auto;
    width: min(330px, calc(100vw - 300px));
    flex-direction: column;
    gap: 10px;
  }

  .rfs-layout__top-left [data-rfs-panel="scenario"] {
    flex: 0 1 auto;
    width: 100%;
    max-height: clamp(130px, calc(100vh - 560px), 180px);
  }

  .rfs-layout__top-left [data-rfs-panel="route-builder"] {
    flex: 0 1 auto;
    width: 100%;
    max-height: clamp(112px, calc(100vh - 570px), 160px);
    overflow: auto;
  }

  .rfs-layout__top-left [data-rfs-panel="takeoff-setup"] {
    flex: 0 0 auto;
    width: min(300px, 100%);
    max-height: clamp(150px, calc(100vh - 560px), 200px);
    overflow: auto;
  }
}

@media (min-width: 1440px) {
  .rfs-layout__controls {
    width: 560px;
  }
}

@media (min-width: 1800px) {
  .rfs-layout__controls {
    width: 720px;
  }
}

@media (max-width: 1100px), (max-height: 760px) {
  .rfs-layout__top-left {
    top: 8px;
    left: 8px;
    right: auto;
    width: clamp(272px, 31vw, 284px);
    max-height: calc(100vh - 256px);
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
  }

  .rfs-layout__top-left [data-rfs-panel="scenario"] {
    flex: 0 1 auto;
    width: 100%;
    max-height: clamp(80px, calc(100vh - 632px), 118px);
    overflow: auto;
  }

  .rfs-layout__top-left [data-rfs-panel="route-builder"] {
    flex: 0 1 auto;
    width: 100%;
    max-height: clamp(112px, calc(100vh - 590px), 132px);
    overflow: auto;
  }

  .rfs-layout__top-left [data-rfs-panel="takeoff-setup"] {
    flex: 0 1 auto;
    width: 100%;
    max-height: clamp(122px, calc(100vh - 600px), 150px);
    overflow: auto;
  }

  .rfs-layout__top-right {
    top: 8px;
    right: 8px;
    width: 240px;
    max-height: clamp(122px, calc(100vh - 560px), 190px);
    gap: 8px;
    overflow: auto;
  }

  .rfs-layout__top-right [data-rfs-panel] {
    max-height: clamp(122px, calc(100vh - 560px), 190px);
    overflow: auto;
  }

  .rfs-layout__debug {
    top: 8px;
    left: calc(8px + clamp(272px, 31vw, 284px) + 8px);
    width: max(220px, calc(100vw - clamp(272px, 31vw, 284px) - 512px));
    min-width: 0;
    max-width: calc(100vw - clamp(272px, 31vw, 284px) - 512px);
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
