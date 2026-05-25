import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';

export interface CesiumViewportProps {
  /** Called with the viewer instance after mount */
  onReady?: (viewer: Cesium.Viewer) => void;
}

export function CesiumViewport({ onReady }: CesiumViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return; // React StrictMode double-mount guard

    const viewer = new Cesium.Viewer(containerRef.current, {
      useDefaultRenderLoop: true,
      // Minimal UI — we build our own
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      // Terrain + imagery from Cesium Ion
      terrain: Cesium.Terrain.fromWorldTerrain(),
    });

    viewerRef.current = viewer;
    viewer.scene.screenSpaceCameraController.enableInputs = false;
    onReady?.(viewer);

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [onReady]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
      data-testid="cesium-viewport"
    />
  );
}
