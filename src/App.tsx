import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { initCesium } from './config/cesium';
import { CesiumViewport } from './viewport/CesiumViewport';
import { ThreeLayer } from './viewport/ThreeLayer';
import { Telemetry } from './components/Telemetry';
import { AttitudeIndicator } from './components/AttitudeIndicator';
import { ControlsHelp } from './components/ControlsHelp';
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
import { CloudLayer } from './viewport/CloudLayer';
import { RfsPFD } from './instruments/RfsPFD';
import { createDefaultAutopilotState, RfsMCP } from './instruments/RfsMCP';
import { ContrailLayer } from './viewport/ContrailLayer';
import { RunwayLayer } from './viewport/RunwayLayer';
import { CockpitLayer } from './viewport/CockpitLayer';
import { nextCameraMode, type CameraMode } from './viewport/cameraMode';
import { nextOverlayMode, shouldShowDebugOverlays, shouldShowFlightInstruments, type OverlayMode } from './viewport/overlayMode';
import { CameraManager } from './viewport/CameraManager';
import { createKseaKpdxFlight } from './sim/flightPlanLoader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FPSMonitor } from './components/FPSMonitor';
import { ScenarioPanel } from './components/ScenarioPanel';
import { RouteStatus } from './components/RouteStatus';
import { SceneStatus } from './components/SceneStatus';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';

const cesiumScenePolicy = initCesium();
type AudioUiStatus = 'off' | 'starting' | 'on' | 'blocked';

function applyLoadedRouteAutopilotDefaults(apState: AutopilotState): AutopilotState {
  const next = structuredClone(apState);
  next.truth.lateralActive = 'LNAV';
  next.truth.verticalActive = 'ALT_HOLD';
  next.truth.thrustActive = 'SPEED';
  next.truth.autopilotStatus = 'CMD_A';
  next.boeing.lnav = true;
  next.boeing.hdgSel = false;
  next.boeing.vnav = false;
  next.boeing.altHold = true;
  next.boeing.vs = false;
  next.boeing.speedMode = true;
  next.boeing.n1 = false;
  next.boeing.autothrottleArm = true;
  return next;
}

export function App() {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioUiStatus>('off');
  useSimLoop();
  useAudioLoop(audioEnabled);

  const startTakeoffRoll = useSimStore((s) => s.startTakeoffRoll);
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

  // Keyboard controls — tracks pressed keys for simultaneous input
  useEffect(() => {
    const keys = keysRef.current;

    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreKeyboardEvent(e)) return;
      const key = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'q', 'e', ' '].includes(key)) {
        if (key === ' ') e.preventDefault();
        keys.add(key);
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
      keys.clear();
      setInput({ elevator: 0, aileron: 0, rudder: 0, brake: 0 });
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
    const cameraManager = new CameraManager(viewer);

    const updateCamera = () => {
      const { status: currentStatus, aircraft: a } = useSimStore.getState();
      cameraManager.update({ status: currentStatus, mode: camMode, aircraft: a });
    };

    updateCamera();
    viewer.scene.preRender.addEventListener(updateCamera);
    return () => {
      viewer.scene.preRender.removeEventListener(updateCamera);
    };
  }, [camMode, status, viewerGeneration]);

  const handleViewerReady = useCallback((viewer: Cesium.Viewer) => {
    viewerRef.current = viewer;
    setViewerGeneration((generation) => generation + 1);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 5000),
      orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-30), roll: 0 },
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

  return (
    <ErrorBoundary>
    <div style={{ width: '100%', height: '100%' }}>
      <CesiumViewport onReady={handleViewerReady} scenePolicy={cesiumScenePolicy} />
      <SceneStatus policy={cesiumScenePolicy} />
      <RunwayLayer viewerRef={viewerRef} />
      {camMode === 'cockpit' ? <CockpitLayer viewerRef={viewerRef} /> : <ThreeLayer viewerRef={viewerRef} />}
      <CloudLayer viewerRef={viewerRef} metar={metarData} />
      <ContrailLayer viewerRef={viewerRef} />
      {showDebugOverlays && <Telemetry />}
      {showDebugOverlays && <ControlsHelp />}
      {showDebugOverlays && <AttitudeIndicator />}
      {showFlightInstruments && <ScenarioPanel />}
      {showFlightInstruments && <RouteStatus />}
      {showFlightInstruments && <RfsPFD />}
      {showFlightInstruments && <RfsMCP />}
      {showDebugOverlays && (
        <div
          style={{
            position: 'fixed',
            top: 10,
            left: 10,
            color: '#0f0',
            fontFamily: 'monospace',
            zIndex: 10,
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
          <button onClick={pause} style={btnStyle}>PAUSE</button>
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
            const fp = createKseaKpdxFlight();
            useSimStore.getState().setFlightPlan(fp);
            const ap = useSimStore.getState().apState ?? createDefaultAutopilotState();
            useSimStore.getState().setApState(applyLoadedRouteAutopilotDefaults(ap));
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
