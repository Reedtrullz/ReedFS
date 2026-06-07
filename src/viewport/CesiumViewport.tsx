import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { getCesiumScenePolicy, type CesiumScenePolicy } from '../config/cesium';
import { isVisualTestMode } from '../config/visualTest';

export interface CesiumViewportProps {
  /** Overrides the resolved Cesium scene asset policy */
  scenePolicy?: CesiumScenePolicy;
  /** Called with the viewer instance after mount */
  onReady?: (viewer: Cesium.Viewer) => void;
}

type GlobeWithOptionalEffects = Cesium.Globe & {
  terrainExaggeration?: number;
  showWaterEffect?: boolean;
};

export function CesiumViewport({ onReady, scenePolicy }: CesiumViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return; // React StrictMode double-mount guard

    const policy = scenePolicy ?? getCesiumScenePolicy();
    let disposed = false;
    const viewerOptions = {
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
      ...(policy.mode === 'degraded' ? { baseLayer: false as const } : {}),
      ...(policy.terrain === 'world' ? { terrain: Cesium.Terrain.fromWorldTerrain() } : {}),
    };
    const viewer = new Cesium.Viewer(containerRef.current, viewerOptions);
    viewerRef.current = viewer;
    viewer.scene.screenSpaceCameraController.enableInputs = false;

    // Enable Cesium OSM 3D buildings
    if (policy.osmBuildings) {
      Cesium.createOsmBuildingsAsync().then((buildings) => {
        if (!disposed && viewerRef.current === viewer && !viewer.isDestroyed()) {
          viewer.scene.primitives.add(buildings);
        }
      }).catch(() => {});
    }

    // Scene enhancements
    const globe = viewer.scene.globe as GlobeWithOptionalEffects;
    const visualTest = isVisualTestMode();
    globe.terrainExaggeration = 1;
    if (!visualTest) {
      globe.enableLighting = true;
      globe.showWaterEffect = true;
      viewer.scene.requestRenderMode = false;
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
    } else {
      globe.enableLighting = false;
      globe.showWaterEffect = false;
      viewer.scene.requestRenderMode = true;
      viewer.scene.maximumRenderTimeChange = 0;
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    }

    containerRef.current.dataset.rfsReady = 'true';
    onReady?.(viewer);

    return () => {
      disposed = true;
      viewer.destroy();
      if (viewerRef.current === viewer) {
        viewerRef.current = null;
      }
    };
  }, [onReady, scenePolicy]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
      data-testid="cesium-viewport"
    />
  );
}
