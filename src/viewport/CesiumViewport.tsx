import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';

export interface CesiumViewportProps {
  /** Called with the viewer instance after mount */
  onReady?: (viewer: Cesium.Viewer) => void;
}

type GlobeWithOptionalEffects = Cesium.Globe & {
  terrainExaggeration?: number;
  showWaterEffect?: boolean;
};

export function CesiumViewport({ onReady }: CesiumViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return; // React StrictMode double-mount guard

    const viewer = new Cesium.Viewer(containerRef.current, {
      useDefaultRenderLoop: true,
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
      terrain: Cesium.Terrain.fromWorldTerrain(),
    });
    viewer.scene.screenSpaceCameraController.enableInputs = false;

    // Enable Cesium OSM 3D buildings
    Cesium.createOsmBuildingsAsync().then((buildings) => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.scene.primitives.add(buildings);
      }
    }).catch(() => {});

    // Scene enhancements
    const globe = viewer.scene.globe as GlobeWithOptionalEffects;
    globe.terrainExaggeration = 1;
    globe.enableLighting = true;
    globe.showWaterEffect = true;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;

    viewerRef.current = viewer;
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
