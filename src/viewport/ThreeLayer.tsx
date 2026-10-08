import { useEffect, useRef, type RefObject } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';
import { useSimStore } from '../store/simStore';
import { computeSunPosition, sunLightIntensity } from '../sim/sun';
import { isCesiumResourceDestroyed } from './cesiumLifecycle';
import { AircraftRenderer } from './AircraftRenderer';
import { scenarioUtcMs } from '../sim/scenarioClock';
import { solarDirectionEcef } from './solarDirection';
import { disposeThreeBridge } from './disposeThreeBridge';
import type { CesiumSceneFailure } from './CesiumViewport';

export interface ThreeLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
  onSceneFailure?: (failure: CesiumSceneFailure) => void;
}

export function ThreeLayer({ viewerRef, onSceneFailure }: ThreeLayerProps) {
  const ttcRef = useRef<ReturnType<typeof ThreeToCesium> | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const scene = viewer.scene;
    if (!scene) return;
    if (ttcRef.current) return;

    let ttc: ReturnType<typeof ThreeToCesium>;
    try {
      ttc = ThreeToCesium(viewer, { cameraFar: 10000000, cameraNear: 0.1 });
    } catch (error: unknown) {
      onSceneFailure?.({ stage: 'context', surface: 'three', error });
      return;
    }
    ttc.threeRenderer.domElement.dataset.rfsSurface = 'three';
    ttcRef.current = ttc;

    // Add lights (persistent)
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1000, 2000, 500);
    ttc.threeScene.add(ambient);
    ttc.threeScene.add(dirLight);
    ttc.threeScene.add(dirLight.target);

    const aircraftRenderer = new AircraftRenderer(ttc);

    // Per-frame sync: update proxy position from sim state
    const sync = () => {
      const { aircraft, effectiveControls } = useSimStore.getState();
      const { lat, lon } = aircraft.position;

      // Update lighting from sun position
      const sun = computeSunPosition(lat, lon, scenarioUtcMs(aircraft));
      const light = sunLightIntensity(sun.elevation);
      ambient.intensity = light.ambient;
      ambient.color.set(light.color);
      dirLight.intensity = light.directional;
      const position = Cesium.Cartesian3.fromDegrees(lon, lat, aircraft.position.alt * 0.3048);
      const direction = solarDirectionEcef(lat, lon, sun);
      dirLight.target.position.set(position.x, position.y, position.z);
      dirLight.position.set(position.x + 2000 * direction.x, position.y + 2000 * direction.y, position.z + 2000 * direction.z);
      dirLight.target.updateMatrixWorld();

      aircraftRenderer.render(aircraft, effectiveControls);
    };

    const postRender = scene.postRender;
    postRender.addEventListener(sync);

    return () => {
      if (!isCesiumResourceDestroyed(viewer)) {
        postRender.removeEventListener(sync);
      }
      try {
        aircraftRenderer.dispose();
      } catch {
        // Three/Cesium bridge internals may already be partially torn down.
      }
      try {
        disposeThreeBridge(ttc);
      } catch {
        // Cesium may have already torn down the container during React cleanup.
      }
      ttcRef.current = null;
    };
  }, [viewerRef, onSceneFailure]);

  return null;
}
