import { useEffect, useRef, type RefObject } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';

interface Runway {
  name: string;
  lat: number;
  lon: number;
  length: number; // meters
  width: number; // meters
  heading: number; // degrees true
}

// KSEA runways (approximate from navdata)
const KSEA_RUNWAYS: Runway[] = [
  { name: '16L/34R', lat: 47.4393, lon: -122.3100, length: 3627, width: 46, heading: 163 },
  { name: '16C/34C', lat: 47.4468, lon: -122.3100, length: 2865, width: 46, heading: 163 },
  { name: '16R/34L', lat: 47.4543, lon: -122.3100, length: 2591, width: 46, heading: 163 },
];

export interface AirportLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
}

export function AirportLayer({ viewerRef }: AirportLayerProps) {
  const ttcRef = useRef<ReturnType<typeof ThreeToCesium> | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (ttcRef.current) return;

    const ttc = ThreeToCesium(viewer, {
      cameraFar: 10000000,
      cameraNear: 0.1,
    });
    ttcRef.current = ttc;

    // Ambient light so the runways are visible
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1000, 2000, 500);
    ttc.threeScene.add(ambient);
    ttc.threeScene.add(dirLight);

    for (const rw of KSEA_RUNWAYS) {
      // Runway surface plane
      const geo = new THREE.PlaneGeometry(rw.width, rw.length);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.9,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);

      // PlaneGeometry lays flat in XY by default. Rotate to horizontal (XZ)
      // then orient by runway heading.
      mesh.rotation.x = -Math.PI / 2; // lay flat
      mesh.rotation.z = ((rw.heading - 90) * Math.PI) / 180; // orient

      const pos = Cesium.Cartesian3.fromDegrees(rw.lon, rw.lat, 0.5); // slight elevation above terrain
      ttc.add(mesh, pos);

      // Runway centerline stripe
      const stripeGeo = new THREE.PlaneGeometry(1.5, rw.length * 0.7);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        side: THREE.DoubleSide,
      });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.rotation.z = ((rw.heading - 90) * Math.PI) / 180;

      // Slightly above the runway surface
      const stripePos = Cesium.Cartesian3.fromDegrees(rw.lon, rw.lat, 0.6);
      ttc.add(stripe, stripePos);
    }

    // Per-frame render sync
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
