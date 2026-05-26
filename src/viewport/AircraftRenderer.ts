import * as Cesium from 'cesium';
import * as THREE from 'three';
import type ThreeToCesium from 'three-to-cesium';
import type { AircraftState, ControlInputs } from '../sim/types';
import { quatToEuler } from '../sim/physics/quaternion';
import { createAircraftModelQuaternion } from './aircraftOrientation';
import { applyAircraftModelAnimations } from './aircraftModelAnimation';
import { createBoeing737Model } from './AircraftModel';

type ThreeToCesiumBridge = Pick<ReturnType<typeof ThreeToCesium>, 'add' | 'remove' | 'update'>;

type AircraftModelFactory = () => THREE.Group;

function cesiumMatrixToThreeMatrix(matrix: Cesium.Matrix4): THREE.Matrix4 {
  const m = matrix as unknown as ArrayLike<number>;
  return new THREE.Matrix4().set(
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  );
}

function updateWrapperTransform(wrapper: THREE.Object3D, position: Cesium.Cartesian3): void {
  const fixedFrame = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  const matrix = cesiumMatrixToThreeMatrix(fixedFrame);

  wrapper.matrix.copy(matrix);
  wrapper.matrix.decompose(wrapper.position, wrapper.quaternion, wrapper.scale);
  wrapper.updateMatrixWorld(true);
}

function aircraftPositionCartesian(aircraft: Pick<AircraftState, 'position'>): Cesium.Cartesian3 {
  const { lat, lon, alt } = aircraft.position;
  return Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048);
}

export class AircraftRenderer {
  private readonly model: THREE.Group;
  private wrapper: THREE.Group | null = null;
  private disposed = false;

  constructor(
    private readonly bridge: ThreeToCesiumBridge,
    modelFactory: AircraftModelFactory = createBoeing737Model,
  ) {
    this.model = modelFactory();
  }

  render(aircraft: AircraftState, controls?: Partial<ControlInputs>): void {
    if (this.disposed) return;

    this.model.quaternion.copy(createAircraftModelQuaternion(quatToEuler(aircraft.quaternion)));
    applyAircraftModelAnimations(this.model, aircraft, controls);

    const position = aircraftPositionCartesian(aircraft);
    if (!this.wrapper) {
      // three-to-cesium returns a wrapper Group whose matrix carries the absolute ENU frame.
      // Keep the aircraft model as that wrapper's child so disposal can call remove(model),
      // matching the package's remove(object.parent/object) semantics.
      this.wrapper = this.bridge.add(this.model, position);
    } else {
      updateWrapperTransform(this.wrapper, position);
    }

    this.bridge.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.wrapper) {
      this.bridge.remove(this.model);
      this.wrapper = null;
    }
  }
}
