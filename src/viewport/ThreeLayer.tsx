import { useEffect, useRef, type RefObject } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';
import { useSimStore } from '../store/simStore';
import { createBoeing737Model } from './AircraftModel';
import { computeSunPosition, sunLightIntensity } from '../sim/sun';
import { quatToEuler } from '../sim/physics/quaternion';
import { createAircraftModelQuaternion } from './aircraftOrientation';
import { applyAircraftModelAnimations } from './aircraftModelAnimation';
import { isCesiumResourceDestroyed } from './cesiumLifecycle';

export interface ThreeLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
}

export function ThreeLayer({ viewerRef }: ThreeLayerProps) {
  const ttcRef = useRef<ReturnType<typeof ThreeToCesium> | null>(null);
  const proxyRef = useRef<THREE.Group | null>(null);

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

    // Create model template ONCE — clone per frame instead of rebuilding geometry
    const modelTemplate = createBoeing737Model();

    // Per-frame sync: update proxy position from sim state
    const sync = () => {
      const aircraft = useSimStore.getState().aircraft;
      const { lat, lon, alt } = aircraft.position;
      const attitude = quatToEuler(aircraft.quaternion);

      // Remove old proxy
      if (proxyRef.current) {
        ttc.remove(proxyRef.current);
      }

      // Clone template (shares geometry buffers, only creates wrapper objects)
      const model = modelTemplate.clone(true) as THREE.Group;
      model.quaternion.copy(createAircraftModelQuaternion(attitude));
      applyAircraftModelAnimations(model, aircraft);

      const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048);
      proxyRef.current = ttc.add(model, pos);

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

      ttc.update();
    };

    const postRender = scene.postRender;
    postRender.addEventListener(sync);

    return () => {
      if (!isCesiumResourceDestroyed(viewer)) {
        postRender.removeEventListener(sync);
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
