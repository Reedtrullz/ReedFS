import { useEffect, type RefObject } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';
import { useSimStore } from '../store/simStore';
import { isCesiumResourceDestroyed } from './cesiumLifecycle';
import { AircraftRenderer } from './AircraftRenderer';
import { createCockpitModel } from './CockpitModel';
import { useCockpitInteractions } from './useCockpitInteractions';
import { installCockpitPointerInteractions } from './cockpitPointerInteractions';

export interface CockpitLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
}

export function CockpitLayer({ viewerRef }: CockpitLayerProps) {
  const { activateCockpitInteraction } = useCockpitInteractions();

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
    const pointerCleanup = installCockpitPointerInteractions({
      scene: ttc.threeScene,
      camera: ttc.threeCamera,
      canvas: ttc.threeRenderer.domElement,
      onActivate: activateCockpitInteraction,
    });

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
        pointerCleanup();
      } catch {
        // Overlay canvas may already be detached during Cesium teardown.
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
  }, [viewerRef, activateCockpitInteraction]);

  return null;
}
