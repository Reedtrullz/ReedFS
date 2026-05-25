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
import { useSimStore } from './store/simStore';
import { readGamepad } from './input/GamepadManager';
import { applyDiscreteKeyInput, computeHeldKeyInputs } from './input/keyboardControls';
import { fetchMetar, parseMetarWind } from './sim/weather';
import type { MetarData } from './sim/weather';
import { CloudLayer } from './viewport/CloudLayer';
import { RfsPFD } from './instruments/RfsPFD';
import { RfsMCP } from './instruments/RfsMCP';
import { ContrailLayer } from './viewport/ContrailLayer';
import { shouldAutoFollowCamera, type CameraMode } from './viewport/cameraMode';
import { createKseaKpdxFlight } from './sim/flightPlanLoader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FPSMonitor } from './components/FPSMonitor';
import type { LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';

initCesium();

export function App() {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  useSimLoop();
  useAudioLoop();

  const start = useSimStore((s) => s.start);
  const pause = useSimStore((s) => s.pause);
  const resume = useSimStore((s) => s.resume);
  const reset = useSimStore((s) => s.reset);
  const status = useSimStore((s) => s.status);
  const setInput = useSimStore((s) => s.setInput);

  const keysRef = useRef(new Set<string>());
  const [camMode, setCamMode] = useState<CameraMode>('chase');
  const [metarData, setMetarData] = useState<MetarData | null>(null);

  // Keyboard controls — tracks pressed keys for simultaneous input
  useEffect(() => {
    const updateFromKeys = () => {
      setInput(computeHeldKeyInputs(keysRef.current));
    };

    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'q', 'e', ' '].includes(key)) {
        if (key === ' ') e.preventDefault();
        keysRef.current.add(key);
        updateFromKeys();
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
      keysRef.current.delete(key);
      updateFromKeys();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      keysRef.current.clear();
      setInput({ elevator: 0, aileron: 0, rudder: 0, brake: 0 });
    };
  }, [setInput]);

  // Gamepad polling
  useEffect(() => {
    let raf: number;
    const poll = () => {
      const gpInputs = readGamepad();
      if (gpInputs) {
        useSimStore.getState().setInput(gpInputs);
      }
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

  // Chase camera — follows aircraft when sim is running
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    // Enable camera controls when paused/stopped, disable when flying
    viewer.scene.screenSpaceCameraController.enableInputs = (status !== 'running');
  }, [status]);

  useEffect(() => {
    let raf: number;
    const update = () => {
      const viewer = viewerRef.current;
      if (!viewer) { raf = requestAnimationFrame(update); return; }
      if (!shouldAutoFollowCamera(status, camMode)) {
        raf = requestAnimationFrame(update);
        return;
      }
      const a = useSimStore.getState().aircraft;
      const altM = a.position.alt * 0.3048;
      if (camMode === 'cockpit') {
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(a.position.lon, a.position.lat, altM + 2),
          new Cesium.HeadingPitchRange(a.attitude.psi, 0, 5),
        );
      } else {
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(a.position.lon, a.position.lat, altM),
          new Cesium.HeadingPitchRange(
            a.attitude.psi - Math.PI, // behind
            Cesium.Math.toRadians(camMode === 'tower' ? -5 : -15),
            camMode === 'tower' ? 1500 : 300,
          ),
        );
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [camMode, status]);

  const handleViewerReady = useCallback((viewer: Cesium.Viewer) => {
    viewerRef.current = viewer;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 5000),
      orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-30), roll: 0 },
    });
  }, []);

  const handleTakeoff = () => {
    setInput({
      throttle1: 1,
      throttle2: 1,
      elevator: 0,
      brake: 0,
      gearLever: 'DOWN',
      flapLever: 5,
    });
    start();
  };

  return (
    <ErrorBoundary>
    <div style={{ width: '100%', height: '100%' }}>
      <CesiumViewport onReady={handleViewerReady} />
      <ThreeLayer viewerRef={viewerRef} />
      <CloudLayer viewerRef={viewerRef} metar={metarData} />
      <ContrailLayer viewerRef={viewerRef} />
      <Telemetry />
      <ControlsHelp />
      <AttitudeIndicator />
      <RfsPFD />
      <RfsMCP />
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
      <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 100, display: 'flex', gap: 8 }}>
        {status === 'stopped' || status === 'paused' ? (
          <>
            <button onClick={handleTakeoff} style={btnStyle}>TAKEOFF</button>
            {status === 'paused' && <button onClick={resume} style={btnStyle}>RESUME</button>}
          </>
        ) : (
          <button onClick={pause} style={btnStyle}>PAUSE</button>
        )}
        <button onClick={reset} style={btnStyle}>RESET</button>
        <button
          onClick={() =>
            setCamMode((m) => (m === 'chase' ? 'cockpit' : m === 'cockpit' ? 'tower' : 'chase'))
          }
          style={btnStyle}
        >
          CAM: {camMode.toUpperCase()}
        </button>
        <button
          onClick={() => {
            const fp = createKseaKpdxFlight();
            useSimStore.getState().setFlightPlan(fp);
            const ap = useSimStore.getState().apState;
            if (ap) {
              const next = structuredClone(ap);
              const lateral: LateralMode = 'LNAV';
              const vertical: VerticalMode = 'VNAV';
              const thrust: ThrustMode = 'SPEED';
              next.truth.lateralActive = lateral;
              next.truth.verticalActive = vertical;
              next.truth.thrustActive = thrust;
              next.truth.autopilotStatus = 'CMD_A';
              useSimStore.getState().setApState(next);
            }
          }}
          style={btnStyle}
        >
          LOAD PLAN
        </button>
      </div>
    </div>
    <FPSMonitor />
    </ErrorBoundary>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(0,255,0,0.2)', color: '#0f0', border: '1px solid #0f0',
  padding: '8px 16px', fontFamily: 'monospace', cursor: 'pointer', fontSize: 14,
};
