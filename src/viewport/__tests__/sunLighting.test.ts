import { describe, expect, it } from 'vitest';
import { applySunAwareLighting, sunElevationDeg } from '../sunLighting';

describe('sunElevationDeg', () => {
  it('puts the sun below the horizon at ENVA during the reported night incident', () => {
    const elevation = sunElevationDeg(63.46, 10.92, new Date('2026-09-24T02:04:00Z'));
    expect(elevation).toBeLessThan(-5);
  });

  it('puts the sun high over the subsolar region at local noon', () => {
    // 13:00Z is one hour past Greenwich noon, so the subsolar point is near
    // 15 W and 15 E has a ~30 deg hour angle at the September equinox.
    const elevation = sunElevationDeg(0, 15, new Date('2026-09-24T13:00:00Z'));
    expect(elevation).toBeGreaterThan(50);
  });
});

describe('applySunAwareLighting', () => {
  function createViewer() {
    const listeners: Array<() => void> = [];
    return {
      listeners,
      viewer: {
        camera: { positionCartographic: { latitude: 1.108, longitude: 0.191 } },
        scene: {
          globe: { enableLighting: true },
          preRender: { addEventListener: (listener: () => void) => listeners.push(listener) },
        },
      },
    };
  }

  it('disables lighting when the camera is on the night side', () => {
    const { viewer, listeners } = createViewer();
    applySunAwareLighting(viewer, () => new Date('2026-09-24T02:04:00Z'));

    viewer.camera.positionCartographic = { latitude: 63.46 * (Math.PI / 180), longitude: 10.92 * (Math.PI / 180) };
    listeners.forEach((listener) => listener());
    expect(viewer.scene.globe.enableLighting).toBe(false);
  });

  it('keeps lighting enabled when the camera is on the day side', () => {
    const { viewer, listeners } = createViewer();
    applySunAwareLighting(viewer, () => new Date('2026-09-24T13:00:00Z'));

    viewer.camera.positionCartographic = { latitude: 0, longitude: 15 * (Math.PI / 180) };
    listeners.forEach((listener) => listener());
    expect(viewer.scene.globe.enableLighting).toBe(true);
  });
});
