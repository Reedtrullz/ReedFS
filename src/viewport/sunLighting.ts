import { computeSunPosition, daylightBlend } from '../sim/sun';

export function sunElevationDeg(latDeg: number, lonDeg: number, date: Date): number {
  return computeSunPosition(latDeg, lonDeg, date.getTime()).elevation * 180 / Math.PI;
}

const LIGHTING_SUN_THRESHOLD_DEG = -2;

export interface SunLightingViewer {
  camera: { positionCartographic?: { latitude: number; longitude: number } };
  scene: {
    globe: { enableLighting: boolean };
    preRender?: { addEventListener: (listener: () => void) => void; removeEventListener?: (listener: () => void) => void };
  };
}

/**
 * Keep real-sun globe lighting while the camera is on the sunlit side, and turn
 * it off during night so imagery stays visible instead of rendering black.
 */
export function applySunAwareLighting(
  viewer: SunLightingViewer,
  now: () => Date,
  setBrightness?: (brightness: number) => void,
): () => void {
  if (!viewer.scene.preRender) return () => {};
  const update = () => {
    const position = viewer.camera.positionCartographic;
    if (!position) return;
    const elevation = sunElevationDeg(
      position.latitude * (180 / Math.PI),
      position.longitude * (180 / Math.PI),
      now(),
    );
    viewer.scene.globe.enableLighting = elevation > LIGHTING_SUN_THRESHOLD_DEG;
    setBrightness?.(0.22 + 0.78 * daylightBlend(elevation * Math.PI / 180));
  };
  viewer.scene.preRender.addEventListener(update);
  return () => viewer.scene.preRender?.removeEventListener?.(update);
}
