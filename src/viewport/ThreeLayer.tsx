import { useEffect, useRef, type RefObject } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';

export interface ThreeLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
}

export function ThreeLayer({ viewerRef }: ThreeLayerProps) {
  const ttcRef = useRef<ReturnType<typeof ThreeToCesium> | null>(null);
  const cubeRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (ttcRef.current) return;

    // Initialize Three-to-Cesium bridge
    const ttc = ThreeToCesium(viewer, {
      cameraFar: 10000000,
      cameraNear: 0.1,
    });
    ttcRef.current = ttc;

    // Create a test cube at KSEA
    const geometry = new THREE.BoxGeometry(50, 50, 50);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const cube = new THREE.Mesh(geometry, material);
    cubeRef.current = cube;

    const position = Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 500);
    ttc.add(cube, position);

    // Add lights
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1000, 2000, 500);
    ttc.threeScene.add(ambient);
    ttc.threeScene.add(dirLight);

    // Sync in the Cesium postRender
    const sync = () => ttc.update();
    viewer.scene.postRender.addEventListener(sync);

    return () => {
      viewer.scene.postRender.removeEventListener(sync);
      ttc.destroy();
      ttcRef.current = null;
    };
  }, [viewerRef]);

  return null;
}
