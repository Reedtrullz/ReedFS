import { useEffect, type RefObject } from 'react';
import * as Cesium from 'cesium';
import type { MetarData } from '../sim/weather';

export interface CloudLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
  metar: MetarData | null;
}

export function CloudLayer({ viewerRef, metar }: CloudLayerProps) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !metar || !metar.clouds.length) return;

    const billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());

    for (const cloud of metar.clouds) {
      const baseAltM = cloud.base * 0.3048;
      const count = cloud.cover === 'OVC' ? 25 : cloud.cover === 'BKN' ? 16 : 9;
      const spread = cloud.cover === 'OVC' ? 0.03 : 0.06;

      for (let i = 0; i < count; i++) {
        const lat = 47.45 + ((i % 5) - 2) * spread;
        const lon = -122.31 + (Math.floor(i / 5) - 1) * spread;

        billboards.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, baseAltM),
          image: createCloudCanvas(),
          scale: 0.4 + Math.random() * 0.3,
          heightReference: Cesium.HeightReference.NONE,
        });
      }
    }

    return () => {
      viewer.scene.primitives.remove(billboards);
    };
  }, [viewerRef, metar]);

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
