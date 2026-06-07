import { describe, expect, it, vi } from 'vitest';
import { CameraManager, cockpitCameraOffset, cockpitCameraOrientation } from '../CameraManager';
import { B737_800_SPEC, createInitialState, type AircraftState } from '../../sim/types';
import type { CameraMode } from '../cameraMode';
import type { SimStatus } from '../../sim/simulationStatus';

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
      setView: vi.fn(),
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
    const offset = cockpitCameraOffset({ phi: 0, theta: 0, psi: 0 });

    expect(offset.north).toBeGreaterThan(14);
    expect(offset.north).toBeLessThan(21);
    expect(Math.abs(offset.east)).toBeLessThan(1);
    expect(offset.up).toBeGreaterThan(1);
    expect(offset.up).toBeLessThan(3);
  });

  it('sets cockpit camera at the pilot eye with an orthonormal body-frame orientation', () => {
    const viewer = createViewer();
    const manager = new CameraManager(viewer as never);

    update(manager, viewer, 'running', 'cockpit', aircraftAtHeading(0));
    const view = viewer.camera.setView.mock.calls.at(-1)?.[0] as {
      orientation: { direction: { x: number; y: number; z: number }; up: { x: number; y: number; z: number } };
    };
    const direction = view.orientation.direction;
    const up = view.orientation.up;
    const dot = direction.x * up.x + direction.y * up.y + direction.z * up.z;

    expect(viewer.camera.lookAt).not.toHaveBeenCalled();
    expect(viewer.camera.setView).toHaveBeenCalledTimes(1);
    expect(dot).toBeCloseTo(0, 5);
  });

  it('rolls cockpit camera up vector with the aircraft instead of horizon-stabilizing it', () => {
    const localRoll = cockpitCameraOrientation({ phi: Math.PI / 2, theta: 0, psi: 0 });
    expect(Math.abs(localRoll.up.east)).toBeGreaterThan(0.9);
    expect(Math.abs(localRoll.up.up)).toBeLessThan(0.1);

    const levelViewer = createViewer();
    const rolledViewer = createViewer();
    const levelManager = new CameraManager(levelViewer as never);
    const rolledManager = new CameraManager(rolledViewer as never);

    update(levelManager, levelViewer, 'running', 'cockpit', aircraftAtHeading(0));
    const rolledAircraft = aircraftAtHeading(0);
    rolledAircraft.attitude.phi = Math.PI / 2;
    update(rolledManager, rolledViewer, 'running', 'cockpit', rolledAircraft);

    const levelUp = levelViewer.camera.setView.mock.calls.at(-1)?.[0].orientation.up as { x: number; y: number; z: number };
    const rolledUp = rolledViewer.camera.setView.mock.calls.at(-1)?.[0].orientation.up as { x: number; y: number; z: number };
    const upDot = Math.abs(levelUp.x * rolledUp.x + levelUp.y * rolledUp.y + levelUp.z * rolledUp.z);

    expect(upDot).toBeLessThan(0.25);
  });

  it('does not call follow lookAt in free camera mode while running', () => {
    const viewer = createViewer();
    const manager = new CameraManager(viewer as never);

    update(manager, viewer, 'running', 'free');

    expect(viewer.camera.cancelFlight).not.toHaveBeenCalled();
    expect(viewer.camera.lookAt).not.toHaveBeenCalled();
  });

  it('snaps follow camera modes while paused or stopped so mode changes are visible immediately', () => {
    const viewer = createViewer();
    const manager = new CameraManager(viewer as never);

    update(manager, viewer, 'stopped', 'chase');
    update(manager, viewer, 'paused', 'tower');
    update(manager, viewer, 'stopped', 'cockpit');

    expect(viewer.camera.lookAt).toHaveBeenCalledTimes(2);
    expect(viewer.camera.setView).toHaveBeenCalledTimes(1);
    expect(viewer.camera.cancelFlight).toHaveBeenCalledTimes(3);
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);
  });

  it('disables manual camera in selected follow modes, not free mode', () => {
    const viewer = createViewer();
    const manager = new CameraManager(viewer as never);

    update(manager, viewer, 'running', 'chase');
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);

    update(manager, viewer, 'running', 'free');
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(true);

    update(manager, viewer, 'paused', 'tower');
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);
  });
});
