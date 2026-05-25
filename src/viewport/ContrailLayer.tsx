import { useEffect, type RefObject } from 'react';
import * as Cesium from 'cesium';
import { useSimStore } from '../store/simStore';

export function ContrailLayer({ viewerRef }: { viewerRef: RefObject<Cesium.Viewer | null> }) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const image = createContrailImage();
    const system = viewer.scene.primitives.add(
      new Cesium.ParticleSystem({
        image,
        startScale: 0.3,
        endScale: 3.0,
        particleLife: 8.0,
        speed: 5.0,
        emissionRate: 0,
        lifetime: 120,
        emitter: new Cesium.CircleEmitter(1.5),
      }),
    );

    let raf: number;
    const update = () => {
      const a = useSimStore.getState().aircraft;
      if (a.position.alt > 25000 && a.engines[0].running) {
        system.emissionRate = 80;
        const pos = Cesium.Cartesian3.fromDegrees(
          a.position.lon,
          a.position.lat,
          a.position.alt * 0.3048 - 5,
        );
        system.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
      } else {
        system.emissionRate = 0;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      viewer.scene.primitives.remove(system);
    };
  }, [viewerRef]);

  return null;
}

function createContrailImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) return c; // fallback for test environments
  const s = 64;
  c.width = s;
  c.height = s;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return c;
}
