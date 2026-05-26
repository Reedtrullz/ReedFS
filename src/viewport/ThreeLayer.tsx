import { useEffect, useRef, type RefObject } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';
import { useSimStore } from '../store/simStore';
import { computeSunPosition, sunLightIntensity } from '../sim/sun';
import { isCesiumResourceDestroyed } from './cesiumLifecycle';
import { AircraftRenderer } from './AircraftRenderer';

export interface ThreeLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
}

export function ThreeLayer({ viewerRef }: ThreeLayerProps) {
  const ttcRef = useRef<ReturnType<typeof ThreeToCesium> | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const scene = viewer.scene;
    if (!scene) return;
    if (ttcRef.current) return;

    const ttc = ThreeToCesium(viewer, {
      cameraFar: 10000000,
      cameraNear: 0.1,
    });
    ttcRef.current = ttc;

    // Add lights (persistent)
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1000, 2000, 500);
    ttc.threeScene.add(ambient);
    ttc.threeScene.add(dirLight);

    const aircraftRenderer = new AircraftRenderer(ttc);

    // Per-frame sync: update proxy position from sim state
    const sync = () => {
      const { aircraft, effectiveControls } = useSimStore.getState();
      const { lat, lon } = aircraft.position;

      // Update lighting from sun position
      const sun = computeSunPosition(lat, lon, aircraft.timeOfDay ?? 12);
      const light = sunLightIntensity(sun.elevation);
      ambient.intensity = light.ambient;
      ambient.color.set(light.color);
      dirLight.intensity = light.directional;
      dirLight.position.set(
        2000 * Math.sin(sun.azimuth) * Math.cos(sun.elevation),
        2000 * Math.sin(sun.elevation),
        2000 * Math.cos(sun.azimuth) * Math.cos(sun.elevation),
      );

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
        ttc.destroy();
      } catch {
        // Cesium may have already torn down the container during React cleanup.
      }
      ttcRef.current = null;
    };
  }, [viewerRef]);

  return null;
}
