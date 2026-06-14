import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Viewer as CesiumViewer } from 'cesium';
import { getCesiumScenePolicy } from '../config/cesium';
import type { RunwayLayerProps } from '../viewport/RunwayLayer';
import { LoadingScreen } from '../components/LoadingScreen';
import { useSimLoop } from '../hooks/useSimLoop';
import { useAudioLoop } from '../hooks/useAudioLoop';
import { getAudioEngine } from '../audio/AudioEngine';
import { useSimStore } from '../store/simStore';
import { readGamepadActions } from '../input/GamepadManager';
import {
  applyDiscreteKeyAction,
  computeHeldKeyActions,
  shouldIgnoreKeyboardEvent,
} from '../input/keyboardControls';
import { mergeInputActions } from '../input/InputManager';
import { nextCameraMode, type CameraMode } from '../viewport/cameraMode';
import { nextOverlayMode, shouldShowDebugOverlays, shouldShowFlightInstruments, type OverlayMode } from '../viewport/overlayMode';
import { createDefaultFlightForScenario } from '../sim/flightPlanLoader';
import { scenarioById } from '../sim/scenarios';
import { FPSMonitor } from '../components/FPSMonitor';
import { EngineStrip } from '../components/EngineStrip';
import { ScenarioPanel } from '../components/ScenarioPanel';
import { RouteStatus } from '../components/RouteStatus';
import { SceneStatus } from '../components/SceneStatus';
import { TakeoffSetupPanel } from '../components/TakeoffSetupPanel';
import { BottomControlBar, type AudioUiStatus } from '../components/BottomControlBar';
import { RfsLayout } from '../components/layout/RfsLayout';
import type { FramePhase, FramePhaseContext } from '../runtime/frameScheduler';
import { useScenarioWeather } from './useScenarioWeather';

const CesiumViewport = lazy(() => import('../viewport/CesiumViewport').then((m) => ({ default: m.CesiumViewport })));
const ThreeLayer = lazy(() => import('../viewport/ThreeLayer').then((m) => ({ default: m.ThreeLayer })));
const CockpitLayer = lazy(() => import('../viewport/CockpitLayer').then((m) => ({ default: m.CockpitLayer })));
const CloudLayer = lazy(() => import('../viewport/CloudLayer').then((m) => ({ default: m.CloudLayer })));
const ContrailLayer = lazy(() => import('../viewport/ContrailLayer').then((m) => ({ default: m.ContrailLayer })));
const RunwayLayer = lazy(() => import('../viewport/RunwayLayer').then((m) => ({ default: m.RunwayLayer })));
const RunwayEditor = lazy(() => import('../viewport/RunwayEditor').then((m) => ({ default: m.RunwayEditor })));
const RfsPFD = lazy(() => import('../instruments/RfsPFD').then((m) => ({ default: m.RfsPFD })));
const RfsMCP = lazy(() => import('../instruments/RfsMCP').then((m) => ({ default: m.RfsMCP })));
const Telemetry = lazy(() => import('../components/Telemetry').then((m) => ({ default: m.Telemetry })));
const AttitudeIndicator = lazy(() => import('../components/AttitudeIndicator').then((m) => ({ default: m.AttitudeIndicator })));
const ControlsHelp = lazy(() => import('../components/ControlsHelp').then((m) => ({ default: m.ControlsHelp })));
const ControlsSettings = lazy(() => import('../components/ControlsSettings').then((m) => ({ default: m.ControlsSettings })));

const cesiumScenePolicy = getCesiumScenePolicy();

export function RfsShell() {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const keysRef = useRef(new Set<string>());
  const renderEffectsRef = useRef(new Set<FramePhase>());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioUiStatus>('off');
  const audioFrame = useAudioLoop(audioEnabled);
  const inputFrame = useCallback(({ dt }: FramePhaseContext) => {
    const actions = mergeInputActions(computeHeldKeyActions(keysRef.current), readGamepadActions());
    useSimStore.getState().applyInputActions(actions, dt);
  }, []);
  const renderEffectsFrame = useCallback((context: FramePhaseContext) => {
    for (const effect of renderEffectsRef.current) effect(context);
  }, []);
  const registerFrameEffect = useCallback((effect: FramePhase) => {
    renderEffectsRef.current.add(effect);
    return () => {
      renderEffectsRef.current.delete(effect);
    };
  }, []);
  useSimLoop({ onInputFrame: inputFrame, onRenderEffectsFrame: renderEffectsFrame, onAudioFrame: audioFrame });

  const startTakeoffRoll = useSimStore((s) => s.startTakeoffRoll);
  const abortTakeoff = useSimStore((s) => s.abortTakeoff);
  const pause = useSimStore((s) => s.pause);
  const resume = useSimStore((s) => s.resume);
  const reset = useSimStore((s) => s.reset);
  const status = useSimStore((s) => s.status);
  const selectedScenarioId = useSimStore((s) => s.selectedScenarioId);
  const setInput = useSimStore((s) => s.setInput);
  const { activeScenario, metarData } = useScenarioWeather(selectedScenarioId);

  const [camMode, setCamMode] = useState<CameraMode>('chase');
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('flight');
  const [viewerGeneration, setViewerGeneration] = useState(0);
  const [runwayOverrides, setRunwayOverrides] = useState<RunwayLayerProps['runwayOverrides']>(undefined);
  const [routeLoadMessage, setRouteLoadMessage] = useState<string | null>(null);

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
        if ((key === 'g' || key === 'f') && e.repeat) return;
        e.preventDefault();
        useSimStore.getState().applyInputActions(action, 0);
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

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;

    void import('../viewport/CameraManager').then(({ CameraManager }) => {
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

  const handleLoadPlan = () => {
    const store = useSimStore.getState();
    const scenario = scenarioById(store.selectedScenarioId);
    const fp = createDefaultFlightForScenario(scenario);
    store.setFlightPlan(fp);
    if (!fp) {
      setRouteLoadMessage(`No default route is available for ${scenario.name}.`);
      return;
    }
    setRouteLoadMessage(
      `${fp.origin}→${fp.destination} route loaded. Takeoff setup reminder: confirm flaps for takeoff, set takeoff trim, keep throttle idle until ready, then press START ROLL.`,
    );
  };

  const showDebugOverlays = shouldShowDebugOverlays(overlayMode);
  const showFlightInstruments = shouldShowFlightInstruments(overlayMode);
  const viewerReady = viewerGeneration > 0;

  return (
    <RfsLayout
      viewport={(
        <Suspense fallback={<LoadingScreen />}>
          <CesiumViewport onReady={handleViewerReady} scenePolicy={cesiumScenePolicy} />
        </Suspense>
      )}
      sceneLayers={viewerReady ? (
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
            <CloudLayer
              viewerRef={viewerRef}
              metar={metarData}
              cloudSeed={activeScenario.weather.cloudSeed}
              cloudAnchor={activeScenario.weather.cloudAnchor}
            />
            <ContrailLayer viewerRef={viewerRef} registerFrameEffect={registerFrameEffect} />
          </Suspense>
        </>
      ) : null}
      debugPanels={showDebugOverlays ? (
        <Suspense fallback={null}>
          <Telemetry />
          <ControlsHelp />
          <ControlsSettings />
          <AttitudeIndicator />
        </Suspense>
      ) : null}
      flightInstruments={showFlightInstruments ? (
        <Suspense fallback={null}>
          <div data-rfs-panel="pfd"><RfsPFD /></div>
          <div data-rfs-panel="mcp"><RfsMCP /></div>
        </Suspense>
      ) : null}
      sceneStatus={<SceneStatus policy={cesiumScenePolicy} />}
      scenarioPanel={showFlightInstruments ? <ScenarioPanel /> : null}
      routeStatus={showFlightInstruments ? <RouteStatus /> : null}
      takeoffSetupPanel={showFlightInstruments ? <TakeoffSetupPanel /> : null}
      engineStrip={<EngineStrip />}
      buildWatermark={showDebugOverlays ? <>RFS — Flight Test Build</> : null}
      fpsMonitor={showDebugOverlays ? <FPSMonitor registerFrameEffect={registerFrameEffect} /> : null}
      controls={(
        <BottomControlBar
          status={status}
          camMode={camMode}
          overlayMode={overlayMode}
          audioEnabled={audioEnabled}
          audioStatus={audioStatus}
          routeLoadMessage={routeLoadMessage}
          onStartRoll={startTakeoffRoll}
          onAbortTakeoff={abortTakeoff}
          onPause={pause}
          onResume={resume}
          onReset={reset}
          onNextCameraMode={() => setCamMode(nextCameraMode)}
          onNextOverlayMode={() => setOverlayMode(nextOverlayMode)}
          onToggleAudio={handleToggleAudio}
          onLoadPlan={handleLoadPlan}
        />
      )}
    />
  );
}
