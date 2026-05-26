import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { eulerToQuat } from '../../sim/physics/quaternion';
import { B737_800_SPEC, createInitialState, type AircraftState, type Attitude } from '../../sim/types';
import { AircraftRenderer } from '../AircraftRenderer';
import { createCockpitModel } from '../CockpitModel';

type FakeBridge = {
  add: ReturnType<typeof vi.fn<(object: THREE.Object3D, position?: unknown) => THREE.Group>>;
  remove: ReturnType<typeof vi.fn<(object: THREE.Object3D) => void>>;
  update: ReturnType<typeof vi.fn<() => void>>;
};

function aircraftAt(params: {
  lat?: number;
  lon?: number;
  alt?: number;
  simTime?: number;
  n1?: number;
  attitude?: Attitude;
} = {}): AircraftState {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = params.lat ?? 47.449;
  aircraft.position.lon = params.lon ?? -122.309;
  aircraft.position.alt = params.alt ?? 433;
  aircraft.simTime = params.simTime ?? 0;
  if (params.attitude) {
    aircraft.attitude = params.attitude;
    aircraft.quaternion = eulerToQuat(params.attitude.phi, params.attitude.theta, params.attitude.psi);
  }
  aircraft.engines[0].n1 = params.n1 ?? 0;
  aircraft.engines[1].n1 = params.n1 ?? 0;
  return aircraft;
}

function createBridge() {
  const wrapper = new THREE.Group();
  const bridge: FakeBridge = {
    add: vi.fn((object: THREE.Object3D) => {
      wrapper.add(object);
      return wrapper;
    }),
    remove: vi.fn((object: THREE.Object3D) => {
      object.parent?.remove(object);
    }),
    update: vi.fn(),
  };
  return { bridge, wrapper };
}

describe('AircraftRenderer', () => {
  it('adds one aircraft model and updates it in place across frames', () => {
    const { bridge } = createBridge();
    const renderer = new AircraftRenderer(bridge);

    renderer.render(aircraftAt({ simTime: 0, n1: 20 }));
    renderer.render(aircraftAt({ lat: 47.45, lon: -122.31, alt: 500, simTime: 1000, n1: 20 }));

    expect(bridge.add).toHaveBeenCalledTimes(1);
    expect(bridge.remove).not.toHaveBeenCalled();
    expect(bridge.update).toHaveBeenCalledTimes(2);
  });

  it('keeps animation state on the same model object instead of cloning per frame', () => {
    const { bridge } = createBridge();
    const renderer = new AircraftRenderer(bridge);

    renderer.render(aircraftAt({ simTime: 1000, n1: 30 }));
    const model = bridge.add.mock.calls[0][0] as THREE.Object3D;
    const leftFan = model.getObjectByName('leftFan');
    const firstRotation = leftFan?.rotation.y ?? 0;

    renderer.render(aircraftAt({ simTime: 2000, n1: 30 }));

    expect(bridge.add.mock.calls[0][0]).toBe(model);
    expect(leftFan?.rotation.y).not.toBe(firstRotation);
    expect(leftFan?.rotation.y).toBeCloseTo(2 * 0.3 * 40, 8);
  });

  it('updates the bridge wrapper geospatial transform in place when the aircraft moves', () => {
    const { bridge, wrapper } = createBridge();
    const renderer = new AircraftRenderer(bridge);

    renderer.render(aircraftAt({ lat: 47.449, lon: -122.309, alt: 433 }));
    const firstMatrix = wrapper.matrix.clone();

    renderer.render(aircraftAt({ lat: 47.459, lon: -122.319, alt: 533 }));

    expect(bridge.add).toHaveBeenCalledTimes(1);
    expect(wrapper.matrix.equals(firstMatrix)).toBe(false);
  });

  it('rotates a cockpit model shell with aircraft heading instead of leaving its station offset in parent ENU', () => {
    const { bridge, wrapper } = createBridge();
    const renderer = new AircraftRenderer(bridge, createCockpitModel);

    renderer.render(aircraftAt({ attitude: { phi: 0, theta: 0, psi: Math.PI / 2 } }));
    wrapper.updateMatrixWorld(true);
    const cockpit = bridge.add.mock.calls[0][0] as THREE.Object3D;
    const mainPanel = cockpit.getObjectByName('mainPanel');
    const panelPosition = new THREE.Vector3();
    mainPanel?.getWorldPosition(panelPosition);

    expect(cockpit.position.y).toBe(0);
    expect(panelPosition.x).toBeGreaterThan(15);
    expect(Math.abs(panelPosition.y)).toBeLessThan(0.01);
  });

  it('removes the persistent model once on dispose, not once per frame', () => {
    const { bridge } = createBridge();
    const renderer = new AircraftRenderer(bridge);

    renderer.render(aircraftAt());
    renderer.render(aircraftAt({ simTime: 1 }));
    const model = bridge.add.mock.calls[0][0] as THREE.Object3D;

    renderer.dispose();
    renderer.dispose();

    expect(bridge.remove).toHaveBeenCalledTimes(1);
    expect(bridge.remove).toHaveBeenCalledWith(model);
  });
});
