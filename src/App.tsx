import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Viewer as CesiumViewer } from 'cesium';
import { getCesiumScenePolicy } from './config/cesium';
import type { RunwayLayerProps } from './viewport/RunwayLayer';
import { LoadingScreen } from './components/LoadingScreen';
import { useSimLoop } from './hooks/useSimLoop';
import { useAudioLoop } from './hooks/useAudioLoop';
import { getAudioEngine } from './audio/AudioEngine';
import { useSimStore } from './store/simStore';
import { readGamepadActions } from './input/GamepadManager';
import {
  applyDiscreteKeyAction,
  applyDiscreteKeyInput,
  computeHeldKeyActions,
  shouldIgnoreKeyboardEvent,
} from './input/keyboardControls';
import { mergeInputActions } from './input/InputManager';
import { fetchMetar, parseMetarWind } from './sim/weather';
import type { MetarData } from './sim/weather';
import { nextCameraMode, type CameraMode } from './viewport/cameraMode';
import { nextOverlayMode, shouldShowDebugOverlays, shouldShowFlightInstruments, type OverlayMode } from './viewport/overlayMode';
import { createDefaultFlightForScenario } from './sim/flightPlanLoader';
import { scenarioById } from './sim/scenarios';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FPSMonitor } from './components/FPSMonitor';
import { EngineStrip } from './components/EngineStrip';
import { ScenarioPanel } from './components/ScenarioPanel';
import { RouteStatus } from './components/RouteStatus';
import { SceneStatus } from './components/SceneStatus';

const CesiumViewport = lazy(() => import('./viewport/CesiumViewport').then((m) => ({ default: m.CesiumViewport })));
const ThreeLayer = lazy(() => import('./viewport/ThreeLayer').then((m) => ({ default: m.ThreeLayer })));
const CockpitLayer = lazy(() => import('./viewport/CockpitLayer').then((m) => ({ default: m.CockpitLayer })));
const CloudLayer = lazy(() => import('./viewport/CloudLayer').then((m) => ({ default: m.CloudLayer })));
const ContrailLayer = lazy(() => import('./viewport/ContrailLayer').then((m) => ({ default: m.ContrailLayer })));
const RunwayLayer = lazy(() => import('./viewport/RunwayLayer').then((m) => ({ default: m.RunwayLayer })));
const RunwayEditor = lazy(() => import('./viewport/RunwayEditor').then((m) => ({ default: m.RunwayEditor })));
const RfsPFD = lazy(() => import('./instruments/RfsPFD').then((m) => ({ default: m.RfsPFD })));
const RfsMCP = lazy(() => import('./instruments/RfsMCP').then((m) => ({ default: m.RfsMCP })));
const Telemetry = lazy(() => import('./components/Telemetry').then((m) => ({ default: m.Telemetry })));
const AttitudeIndicator = lazy(() => import('./components/AttitudeIndicator').then((m) => ({ default: m.AttitudeIndicator })));
const ControlsHelp = lazy(() => import('./components/ControlsHelp').then((m) => ({ default: m.ControlsHelp })));
const ControlsSettings = lazy(() => import('./components/ControlsSettings').then((m) => ({ default: m.ControlsSettings })));

const cesiumScenePolicy = getCesiumScenePolicy();
type AudioUiStatus = 'off' | 'starting' | 'on' | 'blocked';

export function App() {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioUiStatus>('off');
  useSimLoop();
  useAudioLoop(audioEnabled);

  const startTakeoffRoll = useSimStore((s) => s.startTakeoffRoll);
  const abortTakeoff = useSimStore((s) => s.abortTakeoff);
  const pause = useSimStore((s) => s.pause);
  const resume = useSimStore((s) => s.resume);
  const reset = useSimStore((s) => s.reset);
  const status = useSimStore((s) => s.status);
  const setInput = useSimStore((s) => s.setInput);

  const keysRef = useRef(new Set<string>());
  const [camMode, setCamMode] = useState<CameraMode>('chase');
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('flight');
  const [metarData, setMetarData] = useState<MetarData | null>(null);
  const [viewerGeneration, setViewerGeneration] = useState(0);
  const [runwayOverrides, setRunwayOverrides] = useState<RunwayLayerProps['runwayOverrides']>(undefined);

  // Keyboard controls — tracks pressed keys for simultaneous input
  useEffect(() => {
    const keys = keysRef.current;

    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreKeyboardEvent(e)) return;
      const key = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'q', 'e', ' ', 'z', 'x'].includes(key)) {
        if (key === ' ') e.preventDefault();
        keys.add(key);
        return;
      }

      if (key === 'c' || key === 'o') {
        if (e.repeat) return;
        e.preventDefault();
        if (key === 'c') setCamMode(nextCameraMode);
        else setOverlayMode(nextOverlayMode);
        return;
      }

      const action = applyDiscreteKeyAction(key);
      if (action) {
        e.preventDefault();
        useSimStore.getState().applyInputActions(action, 0);
        return;
      }

      const partial = applyDiscreteKeyInput(key, useSimStore.getState().inputs);
      if (partial) {
        const repeatSensitive = key === 'g' || key === 'f';
        if (repeatSensitive && e.repeat) return;
        e.preventDefault();
        setInput(partial);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keys.delete(key);
    };

    const clearHeldKeys = () => {
      keys.clear();
      setInput({ rudder: 0, brake: 0, leftBrake: 0, rightBrake: 0 });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearHeldKeys();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeldKeys);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeldKeys);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearHeldKeys();
    };
  }, [setInput]);

  // Input dynamics and gamepad polling
  useEffect(() => {
    let raf: number;
    let lastTimestamp = 0;
    const poll = (timestamp: number) => {
      const dt = lastTimestamp > 0 ? Math.min((timestamp - lastTimestamp) / 1000, 0.05) : 1 / 60;
      lastTimestamp = timestamp;
      const actions = mergeInputActions(computeHeldKeyActions(keysRef.current), readGamepadActions());
      useSimStore.getState().applyInputActions(actions, dt);
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Fetch METAR weather on mount
  useEffect(() => {
    fetchMetar('KSEA').then((metar) => {
      if (metar) {
        useSimStore.getState().setWind(parseMetarWind(metar));
        setMetarData(metar);
      }
    });
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;

    void import('./viewport/CameraManager').then(({ CameraManager }) => {
      if (cancelled || viewerRef.current !== viewer || viewer.isDestroyed()) return;
      const cameraManager = new CameraManager(viewer);

      const updateCamera = () => {
        const { status: currentStatus, aircraft: a } = useSimStore.getState();
        cameraManager.update({ status: currentStatus, mode: camMode, aircraft: a });
      };

      updateCamera();
      viewer.scene.preRender.addEventListener(updateCamera);
      cleanup = () => viewer.scene.preRender.removeEventListener(updateCamera);
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [camMode, status, viewerGeneration]);

  const handleViewerReady = useCallback((viewer: CesiumViewer) => {
    viewerRef.current = viewer;
    setViewerGeneration((generation) => generation + 1);
    void import('cesium').then(({ Cartesian3, Math: CesiumMath }) => {
      if (viewerRef.current !== viewer || viewer.isDestroyed()) return;
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(10.91, 63.46, 1500),
        orientation: { heading: CesiumMath.toRadians(0), pitch: CesiumMath.toRadians(-30), roll: 0 },
      });
    });
  }, []);

  const handleStartRoll = () => {
    startTakeoffRoll();
  };

  const handleToggleAudio = async () => {
    if (audioEnabled) {
      getAudioEngine().setMasterVolume(0);
      setAudioEnabled(false);
      setAudioStatus('off');
      return;
    }

    setAudioStatus('starting');
    try {
      const engine = getAudioEngine();
      await engine.start();
      engine.setMasterVolume(0.5);
      setAudioEnabled(true);
      setAudioStatus('on');
    } catch {
      setAudioEnabled(false);
      setAudioStatus('blocked');
    }
  };

  const audioButtonLabel = audioStatus === 'starting'
    ? 'AUDIO: STARTING'
    : audioStatus === 'blocked'
      ? 'AUDIO: BLOCKED'
      : audioEnabled
        ? 'AUDIO: ON'
        : 'AUDIO: OFF';

  const showDebugOverlays = shouldShowDebugOverlays(overlayMode);
  const showFlightInstruments = shouldShowFlightInstruments(overlayMode);
  const viewerReady = viewerGeneration > 0;

  return (
    <ErrorBoundary>
    <div style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={<LoadingScreen />}>
        <CesiumViewport onReady={handleViewerReady} scenePolicy={cesiumScenePolicy} />
      </Suspense>
      {viewerReady && (
        <>
          <Suspense key={`runway-${viewerGeneration}`} fallback={null}>
            <RunwayLayer viewerRef={viewerRef} runwayOverrides={runwayOverrides} />
          </Suspense>
          {showDebugOverlays && (
            <Suspense fallback={null}>
              <RunwayEditor onOverridesChange={setRunwayOverrides} />
            </Suspense>
          )}
          <Suspense key={`aircraft-${viewerGeneration}-${camMode}`} fallback={null}>
            {camMode === 'cockpit' ? <CockpitLayer viewerRef={viewerRef} /> : <ThreeLayer viewerRef={viewerRef} />}
          </Suspense>
          <Suspense key={`weather-${viewerGeneration}`} fallback={null}>
            <CloudLayer viewerRef={viewerRef} metar={metarData} />
            <ContrailLayer viewerRef={viewerRef} />
          </Suspense>
        </>
      )}
      {showDebugOverlays && (
        <Suspense fallback={null}>
          <Telemetry />
          <ControlsHelp />
          <ControlsSettings />
          <AttitudeIndicator />
        </Suspense>
      )}
      {showFlightInstruments && (
        <Suspense fallback={null}>
          <RfsPFD />
          <RfsMCP />
        </Suspense>
      )}
      <SceneStatus policy={cesiumScenePolicy} />
      {showFlightInstruments && <ScenarioPanel />}
      {showFlightInstruments && <RouteStatus />}
      <EngineStrip />
      {showDebugOverlays && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: 14,
            color: '#0f0',
            fontFamily: 'monospace',
            zIndex: 10,
            fontSize: 10,
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        >
          RFS — Flight Test Build
        </div>
      )}
      <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 100, display: 'flex', gap: 8 }}>
        {status === 'stopped' || status === 'paused' ? (
          <>
            <button onClick={handleStartRoll} style={btnStyle}>START ROLL</button>
            {status === 'paused' && <button onClick={resume} style={btnStyle}>RESUME</button>}
          </>
        ) : (
          <>
            <button onClick={abortTakeoff} style={abortBtnStyle}>ABORT</button>
            <button onClick={pause} style={btnStyle}>PAUSE</button>
          </>
        )}
        <button onClick={reset} style={btnStyle}>RESET</button>
        <button
          onClick={() => setCamMode(nextCameraMode)}
          style={btnStyle}
        >
          CAM: {camMode.toUpperCase()}
        </button>
        <button
          onClick={() => setOverlayMode(nextOverlayMode)}
          style={btnStyle}
        >
          OVL: {overlayMode.toUpperCase()}
        </button>
        <button
          onClick={handleToggleAudio}
          style={btnStyle}
        >
          {audioButtonLabel}
        </button>
        <button
          onClick={() => {
            const store = useSimStore.getState();
            const scenario = scenarioById(store.selectedScenarioId);
            const fp = createDefaultFlightForScenario(scenario);
            store.setFlightPlan(fp);
          }}
          style={btnStyle}
        >
          LOAD PLAN
        </button>
      </div>
    </div>
    {showDebugOverlays && <FPSMonitor />}
    </ErrorBoundary>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(0,255,0,0.2)', color: '#0f0', border: '1px solid #0f0',
  padding: '8px 16px', fontFamily: 'monospace', cursor: 'pointer', fontSize: 14,
};

const abortBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'rgba(255,80,80,0.24)',
  color: '#ff7777',
  border: '1px solid #ff7777',
  fontWeight: 800,
};
