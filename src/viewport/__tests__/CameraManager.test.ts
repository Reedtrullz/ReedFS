import { describe, expect, it, vi } from 'vitest';
import { CameraManager, cockpitCameraOffset } from '../CameraManager';
import { B737_800_SPEC, createInitialState, type AircraftState } from '../../sim/types';
import type { CameraMode } from '../cameraMode';
import type { SimStatus } from '../../store/simStore';

function aircraftAtHeading(psi: number): AircraftState {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.attitude.psi = psi;
  aircraft.position = { lat: 47.45, lon: -122.301, alt: 432 };
  return aircraft;
}

function createViewer() {
  return {
    camera: {
      cancelFlight: vi.fn(),
      lookAt: vi.fn(),
    },
    scene: {
      screenSpaceCameraController: { enableInputs: true },
    },
  };
}

function update(manager: CameraManager, viewer: ReturnType<typeof createViewer>, status: SimStatus, mode: CameraMode, aircraft = aircraftAtHeading(0)) {
  manager.update({ status, mode, aircraft });
  return viewer.camera.lookAt.mock.calls.at(-1);
}

describe('CameraManager', () => {
  it('keeps chase camera behind rendered nose across headings', () => {
    const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

    headings.forEach((psi) => {
      const viewer = createViewer();
      const manager = new CameraManager(viewer as never);
      const call = update(manager, viewer, 'running', 'chase', aircraftAtHeading(psi));
      const offset = call?.[1] as { x: number; y: number; z: number };
      const forwardEast = Math.sin(psi);
      const forwardNorth = Math.cos(psi);

      expect(offset.x * forwardEast + offset.y * forwardNorth).toBeLessThan(0);
      expect(offset.z).toBeGreaterThan(0);
    });
  });

  it('keeps the cockpit eye point inside the cockpit envelope but ahead of the exterior fuselage center', () => {
    const offset = cockpitCameraOffset({ psi: 0 });

    expect(offset.north).toBeGreaterThan(14);
    expect(offset.north).toBeLessThan(21);
    expect(Math.abs(offset.east)).toBeLessThan(1);
    expect(offset.up).toBeGreaterThan(1);
    expect(offset.up).toBeLessThan(3);
  });

  it('aims cockpit lookAt forward through the windscreen instead of back at the aircraft origin', () => {
    const viewer = createViewer();
    const manager = new CameraManager(viewer as never);

    const call = update(manager, viewer, 'running', 'cockpit', aircraftAtHeading(0));
    const offset = call?.[1] as { x: number; y: number; z: number };

    expect(offset.x).toBeCloseTo(0, 6);
    expect(offset.y).toBeLessThan(-500);
    expect(offset.z).toBeCloseTo(0, 6);
  });

  it('does not call follow lookAt in free camera mode while running', () => {
    const viewer = createViewer();
    const manager = new CameraManager(viewer as never);

    update(manager, viewer, 'running', 'free');

    expect(viewer.camera.cancelFlight).not.toHaveBeenCalled();
    expect(viewer.camera.lookAt).not.toHaveBeenCalled();
  });

  it('disables manual camera only in running follow modes, not free mode', () => {
    const viewer = createViewer();
    const manager = new CameraManager(viewer as never);

    update(manager, viewer, 'running', 'chase');
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);

    update(manager, viewer, 'running', 'free');
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(true);

    update(manager, viewer, 'paused', 'tower');
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(true);
  });
});
