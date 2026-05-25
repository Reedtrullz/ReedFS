import * as Cesium from 'cesium';
import { initCesium } from './config/cesium';
import { CesiumViewport } from './viewport/CesiumViewport';

initCesium();

export function App() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CesiumViewport
        onReady={(viewer) => {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 5000),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-30),
              roll: 0,
            },
          });
        }}
      />
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
        RFS — Phase 0
      </div>
    </div>
  );
}
