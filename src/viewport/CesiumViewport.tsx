import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { getCesiumScenePolicy, rememberCesiumIonToken, type CesiumScenePolicy } from '../config/cesium';
import { isVisualTestMode } from '../config/visualTest';
import { applySunAwareLighting } from './sunLighting';
import { useSimStore } from '../store/simStore';
import { scenarioUtcMs } from '../sim/scenarioClock';

export interface CesiumViewportProps {
  /** Overrides the resolved Cesium scene asset policy */
  scenePolicy?: CesiumScenePolicy;
  /** Called with the viewer instance after mount */
  onReady?: (viewer: Cesium.Viewer) => void;
  /** Reports the first failed Ion scene-asset stage after the viewer mounts */
  onSceneFailure?: (failure: CesiumSceneFailure) => void;
}

export type CesiumSceneFailure =
  | { stage: 'load'; error: unknown }
  | { stage: 'buildings'; error: unknown }
  | { stage: 'imagery'; error: unknown }
  | { stage: 'context'; surface: 'cesium' | 'three' | 'cockpit' | 'unknown'; error: unknown };

type GlobeWithOptionalEffects = Cesium.Globe & {
  terrainExaggeration?: number;
  showWaterEffect?: boolean;
};

export function CesiumViewport({ onReady, onSceneFailure, scenePolicy }: CesiumViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof Cesium === 'undefined') {
      onSceneFailure?.({
        stage: 'load',
        error: new Error('Cesium global unavailable after script load (check CSP).'),
      });
      return;
    }
    if (viewerRef.current) return; // React StrictMode double-mount guard

    const policy = scenePolicy ?? getCesiumScenePolicy();
    rememberCesiumIonToken(policy.token);
    Cesium.Ion.defaultAccessToken = policy.token ?? '';
    // Cesium's bundled blob workers cannot import their blob script under our CSP.
    Reflect.set(globalThis, 'CESIUM_WORKERS', undefined);
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
    const container = containerRef.current;
    let viewer: Cesium.Viewer;
    try {
      viewer = new Cesium.Viewer(container, viewerOptions);
    } catch (error: unknown) {
      onSceneFailure?.({ stage: 'load', error });
      return;
    }
    viewerRef.current = viewer;
    viewer.clock.shouldAnimate = false;
    const syncUtc = () => {
      const date = new Date(scenarioUtcMs(useSimStore.getState().aircraft));
      Cesium.JulianDate.fromDate(date, viewer.clock.currentTime);
      return date;
    };
    syncUtc();
    const removeClockTick = viewer.clock.onTick.addEventListener(syncUtc);
    viewer.scene.screenSpaceCameraController.enableInputs = false;
    if (viewer.canvas) viewer.canvas.dataset.rfsSurface = 'cesium';
    const reportRenderError = (_scene: unknown, error: unknown) => {
      if (!disposed && viewerRef.current === viewer) onSceneFailure?.({ stage: 'imagery', error });
    };
    const removeRenderError = viewer.scene.renderError?.addEventListener(reportRenderError);
    // WebGL loss does not bubble. Capture covers the Cesium and owned overlay canvases.
    const contextLost = (event: Event) => {
      if (disposed || viewerRef.current !== viewer || !(event.target instanceof HTMLCanvasElement)) return;
      event.preventDefault();
      const owner = event.target.dataset.rfsSurface;
      const surface = owner === 'cesium' || owner === 'three' || owner === 'cockpit' ? owner : 'unknown';
      onSceneFailure?.({ stage: 'context', surface, error: new Error('Graphics context lost.') });
    };
    container.addEventListener('webglcontextlost', contextLost, true);

    // Enable Cesium OSM 3D buildings
    if (policy.osmBuildings) {
      Cesium.createOsmBuildingsAsync().then((buildings) => {
        if (!disposed && viewerRef.current === viewer && !viewer.isDestroyed()) {
          viewer.scene.primitives.add(buildings);
        }
      }).catch((error: unknown) => {
        if (!disposed && viewerRef.current === viewer && !viewer.isDestroyed()) {
          onSceneFailure?.({ stage: 'buildings', error });
        }
      });
    }

    // Scene enhancements
    const globe = viewer.scene.globe as GlobeWithOptionalEffects;
    const visualTest = isVisualTestMode();
    let removeSolar: (() => void) | undefined;
    globe.terrainExaggeration = 1;
    if (!visualTest) {
      globe.enableLighting = true;
      const baseColor = globe.baseColor.clone();
      const dimmedColor = baseColor.clone();
      removeSolar = applySunAwareLighting(viewer, syncUtc, (brightness) => {
        for (let i = 0; i < viewer.imageryLayers.length; i++) viewer.imageryLayers.get(i).brightness = brightness;
        dimmedColor.red = baseColor.red * brightness;
        dimmedColor.green = baseColor.green * brightness;
        dimmedColor.blue = baseColor.blue * brightness;
        globe.baseColor = dimmedColor;
        // The night-side visibility guard disables physical globe lighting;
        // keep its sky atmosphere on the same bounded scenario twilight blend.
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.brightnessShift = brightness - 1;
      });
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
      removeClockTick();
      removeSolar?.();
      container.removeEventListener('webglcontextlost', contextLost, true);
      removeRenderError?.();
      delete container.dataset.rfsReady;
      const canvas = viewer.canvas;
      try {
        if (!viewer.isDestroyed()) viewer.destroy();
      } finally {
        // Cesium releases resources, but does not retire the native context itself.
        // A detached context must not accumulate across explicit view recreations.
        canvas?.remove();
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      }
      if (viewerRef.current === viewer) {
        viewerRef.current = null;
      }
    };
  }, [onReady, onSceneFailure, scenePolicy]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
      data-testid="cesium-viewport"
    />
  );
}
