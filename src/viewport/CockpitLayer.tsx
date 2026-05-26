import { useEffect, type RefObject } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';
import { useSimStore } from '../store/simStore';
import { isCesiumResourceDestroyed } from './cesiumLifecycle';
import { AircraftRenderer } from './AircraftRenderer';
import { createCockpitModel } from './CockpitModel';

export interface CockpitLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
}

export function CockpitLayer({ viewerRef }: CockpitLayerProps) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const scene = viewer.scene;
    if (!scene) return;

    const ttc = ThreeToCesium(viewer, {
      cameraFar: 10000000,
      cameraNear: 0.1,
    });
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    const panelLight = new THREE.DirectionalLight(0xffffff, 0.7);
    panelLight.position.set(0, 3, 4);
    ttc.threeScene.add(ambient);
    ttc.threeScene.add(panelLight);
    const cockpitRenderer = new AircraftRenderer(ttc, createCockpitModel);

    const sync = () => {
      const { aircraft, effectiveControls } = useSimStore.getState();
      cockpitRenderer.render(aircraft, effectiveControls);
    };

    const postRender = scene.postRender;
    postRender.addEventListener(sync);

    return () => {
      if (!isCesiumResourceDestroyed(viewer)) {
        postRender.removeEventListener(sync);
      }
      try {
        cockpitRenderer.dispose();
      } catch {
        // three-to-cesium may already be partially torn down.
      }
      try {
        ttc.destroy();
      } catch {
        // Cesium may have already torn down the container during React cleanup.
      }
    };
  }, [viewerRef]);

  return null;
}
