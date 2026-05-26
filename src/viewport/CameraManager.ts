import * as Cesium from 'cesium';
import * as THREE from 'three';
import type { AircraftState, Attitude } from '../sim/types';
import type { SimStatus } from '../store/simStore';
import { chaseCameraOffset, type EnuOffset } from './cameraFollow';
import { shouldAutoFollowCamera, type CameraMode } from './cameraMode';
import { createAircraftModelQuaternion } from './aircraftOrientation';

export interface CameraManagerUpdate {
  aircraft: Pick<AircraftState, 'position' | 'attitude'>;
  status: SimStatus;
  mode: CameraMode;
}

function modelOffsetToEnu(attitude: Attitude, offset: THREE.Vector3): EnuOffset {
  const enu = offset.clone().applyQuaternion(createAircraftModelQuaternion(attitude));
  return { east: enu.x, north: enu.y, up: enu.z };
}

export function cockpitCameraOffset(attitude: Attitude): EnuOffset {
  return modelOffsetToEnu(attitude, new THREE.Vector3(0, 17.5, 1.9));
}

export function cockpitCameraOrientation(attitude: Attitude): { direction: EnuOffset; up: EnuOffset } {
  return {
    direction: modelOffsetToEnu(attitude, new THREE.Vector3(0, 1, 0)),
    up: modelOffsetToEnu(attitude, new THREE.Vector3(0, 0, 1)),
  };
}

function targetForAircraft(aircraft: Pick<AircraftState, 'position'>, altitudeOffsetM = 0): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(
    aircraft.position.lon,
    aircraft.position.lat,
    aircraft.position.alt * 0.3048 + altitudeOffsetM,
  );
}

function fixedFrameForAircraft(aircraft: Pick<AircraftState, 'position'>): Cesium.Matrix4 {
  return Cesium.Transforms.eastNorthUpToFixedFrame(targetForAircraft(aircraft));
}

function positionFromEnuOffset(frame: Cesium.Matrix4, offset: EnuOffset): Cesium.Cartesian3 {
  return Cesium.Matrix4.multiplyByPoint(frame, cesiumOffset(offset), new Cesium.Cartesian3());
}

function vectorFromEnuOffset(frame: Cesium.Matrix4, offset: EnuOffset): Cesium.Cartesian3 {
  const vector = Cesium.Matrix4.multiplyByPointAsVector(frame, cesiumOffset(offset), new Cesium.Cartesian3());
  return Cesium.Cartesian3.normalize(vector, vector);
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
      const localFrame = fixedFrameForAircraft(aircraft);
      const eye = cockpitCameraOffset(aircraft.attitude);
      const orientation = cockpitCameraOrientation(aircraft.attitude);
      this.viewer.camera.setView({
        destination: positionFromEnuOffset(localFrame, eye),
        orientation: {
          direction: vectorFromEnuOffset(localFrame, orientation.direction),
          up: vectorFromEnuOffset(localFrame, orientation.up),
        },
        endTransform: Cesium.Matrix4.IDENTITY,
      });
      return;
    }

    this.viewer.camera.lookAt(
      targetForAircraft(aircraft),
      cesiumOffset(offsetForMode(mode, aircraft)),
    );
  }
}
