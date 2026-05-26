import * as THREE from 'three';
import type { AircraftState, ControlInputs } from '../sim/types';
import { createAircraftVisualState, type AircraftVisualState } from './aircraftVisualState';

export function applyAircraftModelAnimations(
  model: THREE.Object3D,
  aircraft: Pick<AircraftState, 'engines' | 'simTime' | 'ground' | 'config'> & {
    electrical?: Pick<AircraftState['electrical'], 'batteryVolts' | 'acBusPowered'>;
  },
  controls?: Partial<ControlInputs>,
): void {
  const visualState = createAircraftVisualState(aircraft, controls);
  applyEngineFanSpin(model, visualState);
  applyGearState(model, visualState);
  applyFlapState(model, visualState);
  applyControlSurfaceState(model, visualState);
  applyLightState(model, visualState);
}

function applyEngineFanSpin(model: THREE.Object3D, visualState: AircraftVisualState): void {
  const leftEngine = model.getObjectByName('leftEngine');
  const rightEngine = model.getObjectByName('rightEngine');
  if (leftEngine) leftEngine.rotation.y = 0;
  if (rightEngine) rightEngine.rotation.y = 0;

  const leftFan = model.getObjectByName('leftFan');
  const rightFan = model.getObjectByName('rightFan');
  if (leftFan) leftFan.rotation.y = visualState.fans.leftRotationRad;
  if (rightFan) rightFan.rotation.y = visualState.fans.rightRotationRad;
}

function applyGearState(model: THREE.Object3D, visualState: AircraftVisualState): void {
  ['noseGear', 'leftMainGear', 'rightMainGear'].forEach((gearName) => {
    const gear = model.getObjectByName(gearName);
    if (!gear) return;
    gear.visible = visualState.gear.visible;
    gear.scale.z = visualState.gear.compressionScaleZ;
    gear.scale.x = 1;
    gear.scale.y = 1;
    const baseZ = typeof gear.userData.rfsBasePositionZ === 'number'
      ? gear.userData.rfsBasePositionZ
      : gear.position.z;
    gear.userData.rfsBasePositionZ = baseZ;
    gear.position.z = baseZ + (1 - visualState.gear.extensionFraction) * 2.4;
  });
}

function applyFlapState(model: THREE.Object3D, visualState: AircraftVisualState): void {
  ['leftFlap', 'rightFlap'].forEach((flapName) => {
    const flap = model.getObjectByName(flapName);
    if (!flap) return;
    flap.rotation.x = visualState.flaps.deflectionRad;
  });
}

function applyControlSurfaceState(model: THREE.Object3D, visualState: AircraftVisualState): void {
  const leftAileron = model.getObjectByName('leftAileron');
  const rightAileron = model.getObjectByName('rightAileron');
  const leftElevator = model.getObjectByName('leftElevator');
  const rightElevator = model.getObjectByName('rightElevator');
  const rudder = model.getObjectByName('rudder');

  if (leftAileron) leftAileron.rotation.x = visualState.controls.leftAileronRad;
  if (rightAileron) rightAileron.rotation.x = visualState.controls.rightAileronRad;
  if (leftElevator) leftElevator.rotation.x = visualState.controls.leftElevatorRad;
  if (rightElevator) rightElevator.rotation.x = visualState.controls.rightElevatorRad;
  if (rudder) rudder.rotation.z = visualState.controls.rudderRad;
}

function applyLightState(model: THREE.Object3D, visualState: AircraftVisualState): void {
  ['leftNavLight', 'rightNavLight', 'tailNavLight'].forEach((lightName) => {
    const light = model.getObjectByName(lightName);
    if (light) light.visible = visualState.lights.navVisible;
  });

  const beacon = model.getObjectByName('beacon');
  if (beacon) beacon.visible = visualState.lights.beaconVisible;

  const landingLight = model.getObjectByName('landingLight');
  if (landingLight) landingLight.visible = visualState.lights.landingVisible;
}
