import { useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import { initCesium } from './config/cesium';
import { CesiumViewport } from './viewport/CesiumViewport';
import { ThreeLayer } from './viewport/ThreeLayer';
import { AirportLayer } from './viewport/AirportLayer';
import { Telemetry } from './components/Telemetry';
import { AttitudeIndicator } from './components/AttitudeIndicator';
import { useSimLoop } from './hooks/useSimLoop';
import { useSimStore } from './store/simStore';

initCesium();

export function App() {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  useSimLoop();

  const start = useSimStore((s) => s.start);
  const pause = useSimStore((s) => s.pause);
  const resume = useSimStore((s) => s.resume);
  const reset = useSimStore((s) => s.reset);
  const status = useSimStore((s) => s.status);
  const setInput = useSimStore((s) => s.setInput);

  const keysRef = useRef(new Set<string>());

  // Keyboard controls — tracks pressed keys for simultaneous input
  useEffect(() => {
    const updateFromKeys = () => {
      const k = keysRef.current;
      setInput({
        elevator: (k.has('w') ? -0.4 : 0) + (k.has('s') ? 0.4 : 0),
        aileron: (k.has('a') ? -0.5 : 0) + (k.has('d') ? 0.5 : 0),
        rudder: (k.has('q') ? -0.5 : 0) + (k.has('e') ? 0.5 : 0),
      });
    };

    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'q', 'e'].includes(key)) {
        keysRef.current.add(key);
        updateFromKeys();
        return;
      }
      switch (key) {
        case 'arrowup': setInput({ throttle1: 1, throttle2: 1 }); break;
        case 'arrowdown': setInput({ throttle1: 0, throttle2: 0 }); break;
        case 'g': {
          const gear = useSimStore.getState().inputs.gearLever;
          setInput({ gearLever: gear === 'UP' ? 'DOWN' : 'UP' });
          break;
        }
        case 'f': {
          const flaps = useSimStore.getState().inputs.flapLever;
          const next = flaps >= 40 ? 0 : flaps < 5 ? 5 : flaps + 5;
          setInput({ flapLever: next });
          break;
        }
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
    };
  }, [setInput]);

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
      const a = useSimStore.getState().aircraft;
      const altM = a.position.alt * 0.3048;
      viewer.camera.lookAt(
        Cesium.Cartesian3.fromDegrees(a.position.lon, a.position.lat, altM),
        new Cesium.HeadingPitchRange(
          a.attitude.psi - Math.PI, // behind the aircraft
          Cesium.Math.toRadians(-15), // slightly above
          300, // 300m behind
        ),
      );
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleTakeoff = () => {
    setInput({ throttle1: 1, throttle2: 1, elevator: -0.3, gearLever: 'UP', flapLever: 5 });
    start();
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CesiumViewport
        onReady={(viewer) => {
          viewerRef.current = viewer;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 5000),
            orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-30), roll: 0 },
          });
        }}
      />
      <ThreeLayer viewerRef={viewerRef} />
      <AirportLayer viewerRef={viewerRef} />
      <Telemetry />
      <AttitudeIndicator />
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
        RFS — Phase 1.5
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
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(0,255,0,0.2)', color: '#0f0', border: '1px solid #0f0',
  padding: '8px 16px', fontFamily: 'monospace', cursor: 'pointer', fontSize: 14,
};
