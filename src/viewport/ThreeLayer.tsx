import { useEffect, useRef, type RefObject } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';
import { useSimStore } from '../store/simStore';
import { createBoeing737Model } from './AircraftModel';

export interface ThreeLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
}

export function ThreeLayer({ viewerRef }: ThreeLayerProps) {
  const ttcRef = useRef<ReturnType<typeof ThreeToCesium> | null>(null);
  const proxyRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
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

    // Per-frame sync: update proxy position from sim state
    const sync = () => {
      const aircraft = useSimStore.getState().aircraft;
      const { lat, lon, alt } = aircraft.position;
      const { phi, theta, psi } = aircraft.attitude;

      // Remove old proxy
      if (proxyRef.current) {
        ttc.remove(proxyRef.current);
      }

      // Build 737 proxy
      const model = createBoeing737Model();
      model.rotation.set(
        theta,
        0,
        -phi,
      );

      const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048);
      proxyRef.current = ttc.add(model, pos);

      ttc.update();
    };

    viewer.scene.postRender.addEventListener(sync);

    return () => {
      viewer.scene.postRender.removeEventListener(sync);
      ttc.destroy();
      ttcRef.current = null;
    };
  }, [viewerRef]);

  return null;
}
