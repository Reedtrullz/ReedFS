import { useEffect, type RefObject } from 'react';
import * as Cesium from 'cesium';
import type { CloudAnchor, MetarData } from '../sim/weather';

export interface CloudLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
  metar: MetarData | null;
  cloudSeed: number;
  cloudAnchor: CloudAnchor;
}

function seededRandom(seed: number): () => number {
  let state = (Math.trunc(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function CloudLayer({ viewerRef, metar, cloudSeed, cloudAnchor }: CloudLayerProps) {
  const anchorLat = cloudAnchor.lat;
  const anchorLon = cloudAnchor.lon;
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !metar || !metar.clouds.length) return;

    const billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
    const random = seededRandom(cloudSeed);

    for (const cloud of metar.clouds) {
      const baseAltM = cloud.base * 0.3048;
      const count = cloud.cover === 'OVC' ? 25 : cloud.cover === 'BKN' ? 16 : 9;
      const spread = cloud.cover === 'OVC' ? 0.03 : 0.06;

      for (let i = 0; i < count; i++) {
        const lat = anchorLat + ((i % 5) - 2) * spread;
        const lon = anchorLon + (Math.floor(i / 5) - 1) * spread;

        billboards.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, baseAltM),
          image: createCloudCanvas(),
          scale: 0.4 + random() * 0.3,
          heightReference: Cesium.HeightReference.NONE,
        });
      }
    }

    return () => {
      viewer.scene.primitives.remove(billboards);
    };
  }, [viewerRef, metar, cloudSeed, anchorLat, anchorLon]);

  return null;
}

function createCloudCanvas(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas;
}
