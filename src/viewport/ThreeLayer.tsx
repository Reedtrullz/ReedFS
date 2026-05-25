import { useEffect, useRef, type RefObject } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';
import { useSimStore } from '../store/simStore';

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

      // Build crude 737 proxy
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(10, 3, 30),
        new THREE.MeshStandardMaterial({ color: 0xdddddd }),
      );
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(35, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0xcccccc }),
      );
      const tailV = new THREE.Mesh(
        new THREE.BoxGeometry(14, 8, 2),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
      );
      tailV.position.set(0, 4, -13);
      const tailH = new THREE.Mesh(
        new THREE.BoxGeometry(18, 1, 4),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
      );
      tailH.position.set(0, 0, -13);

      const group = new THREE.Group();
      group.add(body);
      group.add(wing);
      group.add(tailV);
      group.add(tailH);

      // Orient: Three.js default is Y-up, Cesium is Z-up. The three-to-cesium
      // library handles this rotation internally. We set the group rotation
      // to match the aircraft attitude.
      // In the Cesium local frame (ENU): heading rotates around Z-up.
      // pitch rotates around Y, roll around X.
      group.rotation.set(
        theta,               // pitch — nose up/down around local Y
        0,                   // placeholder — heading applied below
        -phi,                // roll — negative because phi is +right-wing-down
      );

      const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048);
      proxyRef.current = ttc.add(group, pos);

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
