/**
 * Approximate solar elevation (degrees) for a ground position. Accuracy of a
 * degree or two is sufficient: the only consumer is a day/night lighting gate.
 */
export function sunElevationDeg(latDeg: number, lonDeg: number, date: Date = new Date()): number {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const meanLongitude = (280.46 + 0.9856474 * n) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360) * rad;
  const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * rad;
  const obliquity = 23.439 * rad;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const gmstRad = (((18.697374558 + 24.06570982441908 * n) % 24) * 15) * rad;
  const hourAngle = gmstRad + lonDeg * rad - rightAscension;
  const latRad = latDeg * rad;
  const elevation = Math.asin(
    Math.sin(latRad) * Math.sin(declination) + Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle),
  );
  return elevation / rad;
}

const LIGHTING_SUN_THRESHOLD_DEG = -2;

export interface SunLightingViewer {
  camera: { positionCartographic?: { latitude: number; longitude: number } };
  scene: {
    globe: { enableLighting: boolean };
    preRender?: { addEventListener: (listener: () => void) => void };
  };
}

/**
 * Keep real-sun globe lighting while the camera is on the sunlit side, and turn
 * it off during night so imagery stays visible instead of rendering black.
 */
export function applySunAwareLighting(
  viewer: SunLightingViewer,
  now: () => Date = () => new Date(),
): void {
  if (!viewer.scene.preRender) return;
  viewer.scene.preRender.addEventListener(() => {
    const position = viewer.camera.positionCartographic;
    if (!position) return;
    const elevation = sunElevationDeg(
      position.latitude * (180 / Math.PI),
      position.longitude * (180 / Math.PI),
      now(),
    );
    viewer.scene.globe.enableLighting = elevation > LIGHTING_SUN_THRESHOLD_DEG;
  });
}
