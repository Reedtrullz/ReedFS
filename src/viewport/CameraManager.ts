import * as Cesium from 'cesium';
import type { AircraftState, Attitude } from '../sim/types';
import type { SimStatus } from '../store/simStore';
import { chaseCameraOffset, headingForwardEnu, type EnuOffset } from './cameraFollow';
import { shouldAutoFollowCamera, type CameraMode } from './cameraMode';

export interface CameraManagerUpdate {
  aircraft: Pick<AircraftState, 'position' | 'attitude'>;
  status: SimStatus;
  mode: CameraMode;
}

export function cockpitCameraOffset(attitude: Pick<Attitude, 'psi'>): EnuOffset {
  const forward = headingForwardEnu(attitude.psi);
  const eyeForwardMeters = 17.5;
  return {
    east: forward.east * eyeForwardMeters,
    north: forward.north * eyeForwardMeters,
    up: 1.9,
  };
}

function targetForAircraft(aircraft: Pick<AircraftState, 'position'>, altitudeOffsetM = 0): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(
    aircraft.position.lon,
    aircraft.position.lat,
    aircraft.position.alt * 0.3048 + altitudeOffsetM,
  );
}

function targetForAircraftOffset(aircraft: Pick<AircraftState, 'position'>, offset: EnuOffset): Cesium.Cartesian3 {
  const metersPerDegLon = 111_320 * Math.cos(aircraft.position.lat * Math.PI / 180);
  return Cesium.Cartesian3.fromDegrees(
    aircraft.position.lon + offset.east / metersPerDegLon,
    aircraft.position.lat + offset.north / 111_320,
    aircraft.position.alt * 0.3048 + offset.up,
  );
}

function cesiumOffset(offset: EnuOffset): Cesium.Cartesian3 {
  return new Cesium.Cartesian3(offset.east, offset.north, offset.up);
}

function offsetForMode(mode: CameraMode, aircraft: Pick<AircraftState, 'attitude'>): EnuOffset {
  switch (mode) {
    case 'chase':
      return chaseCameraOffset(aircraft.attitude, 300, Cesium.Math.toRadians(15));
    case 'tower':
      return chaseCameraOffset(aircraft.attitude, 1500, Cesium.Math.toRadians(5));
    case 'cockpit':
      return cockpitCameraOffset(aircraft.attitude);
    case 'free':
      return { east: 0, north: 0, up: 0 };
  }
}

export class CameraManager {
  constructor(private readonly viewer: Cesium.Viewer) {}

  update({ aircraft, status, mode }: CameraManagerUpdate): void {
    const follows = shouldAutoFollowCamera(status, mode);
    this.viewer.scene.screenSpaceCameraController.enableInputs = !follows;
    if (!follows) return;

    this.viewer.camera.cancelFlight();
    if (mode === 'cockpit') {
      const eye = cockpitCameraOffset(aircraft.attitude);
      const forward = headingForwardEnu(aircraft.attitude.psi);
      const lookAhead: EnuOffset = { east: forward.east * 800, north: forward.north * 800, up: eye.up };
      this.viewer.camera.lookAt(
        targetForAircraftOffset(aircraft, lookAhead),
        cesiumOffset({ east: eye.east - lookAhead.east, north: eye.north - lookAhead.north, up: 0 }),
      );
      return;
    }

    this.viewer.camera.lookAt(
      targetForAircraft(aircraft),
      cesiumOffset(offsetForMode(mode, aircraft)),
    );
  }
}
