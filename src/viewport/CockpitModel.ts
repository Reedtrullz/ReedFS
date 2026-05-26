import * as THREE from 'three';
import { attachCockpitInteractionMetadata } from './cockpitInteractions';

const COCKPIT_SHELL_STATION_M = 14.5;

type Vec3Tuple = [number, number, number];

function atCockpitStation([x, y, z]: Vec3Tuple): Vec3Tuple {
  return [x, y + COCKPIT_SHELL_STATION_M, z];
}

function addBox(
  parent: THREE.Object3D,
  name: string,
  size: Vec3Tuple,
  position: Vec3Tuple,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addShellBox(
  parent: THREE.Object3D,
  name: string,
  size: Vec3Tuple,
  position: Vec3Tuple,
  material: THREE.Material,
): THREE.Mesh {
  return addBox(parent, name, size, atCockpitStation(position), material);
}

function addCylinder(
  parent: THREE.Object3D,
  name: string,
  radius: number,
  depth: number,
  position: Vec3Tuple,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 16), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addShellCylinder(
  parent: THREE.Object3D,
  name: string,
  radius: number,
  depth: number,
  position: Vec3Tuple,
  material: THREE.Material,
): THREE.Mesh {
  return addCylinder(parent, name, radius, depth, atCockpitStation(position), material);
}

function addGroup(parent: THREE.Object3D, name: string, position: Vec3Tuple): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  return group;
}

function addShellGroup(parent: THREE.Object3D, name: string, position: Vec3Tuple): THREE.Group {
  return addGroup(parent, name, atCockpitStation(position));
}

export function createCockpitModel(): THREE.Group {
  const cockpit = new THREE.Group();
  cockpit.name = 'cockpitShell';
  // RFS render axes: +Y forward/nose, +X right, +Z up. Keep the returned root
  // at the aircraft origin because AircraftRenderer applies the aircraft body
  // quaternion to this root. Cockpit geometry is offset forward in local model
  // coordinates so it rotates with heading, pitch, and roll instead of sliding
  // north in the parent ENU frame.

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1d252d, roughness: 0.55, metalness: 0.12 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.65 });
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x082033 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x6fb4ff, transparent: true, opacity: 0.25, roughness: 0.05 });
  const controlMat = new THREE.MeshStandardMaterial({ color: 0x20252a, roughness: 0.48 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x25201c, roughness: 0.75 });

  addShellBox(cockpit, 'floor', [5.6, 7.0, 0.16], [0, 1.8, -1.15], frameMat);
  addShellBox(cockpit, 'leftSidewall', [0.18, 7.0, 2.2], [-2.9, 1.8, 0.0], frameMat);
  addShellBox(cockpit, 'rightSidewall', [0.18, 7.0, 2.2], [2.9, 1.8, 0.0], frameMat);
  addShellBox(cockpit, 'overheadFrame', [5.5, 3.0, 0.18], [0, 4.7, 2.25], frameMat);

  const windshieldFrame = addShellGroup(cockpit, 'windshieldFrame', [0, 5.35, 1.5]);
  addBox(windshieldFrame, 'windshieldTopRail', [5.2, 0.22, 0.14], [0, 0, 0.52], frameMat);
  addBox(windshieldFrame, 'windshieldBottomRail', [5.2, 0.22, 0.14], [0, 0, -0.52], frameMat);
  addBox(windshieldFrame, 'leftWindshieldPost', [0.16, 0.24, 1.05], [-2.55, 0, 0], frameMat);
  addBox(windshieldFrame, 'rightWindshieldPost', [0.16, 0.24, 1.05], [2.55, 0, 0], frameMat);
  addShellBox(cockpit, 'leftWindshieldPane', [2.15, 0.08, 0.82], [-1.15, 5.48, 1.5], glassMat);
  addShellBox(cockpit, 'rightWindshieldPane', [2.15, 0.08, 0.82], [1.15, 5.48, 1.5], glassMat);
  addShellBox(cockpit, 'centerWindowPost', [0.16, 0.3, 1.1], [0, 5.55, 1.5], frameMat);
  addShellBox(cockpit, 'leftSideWindowPane', [0.08, 1.2, 0.72], [-2.82, 4.15, 1.25], glassMat);
  addShellBox(cockpit, 'rightSideWindowPane', [0.08, 1.2, 0.72], [2.82, 4.15, 1.25], glassMat);

  addShellBox(cockpit, 'glareshield', [5.0, 0.75, 0.22], [0, 3.65, 0.75], panelMat);
  addShellBox(cockpit, 'mcpPanel', [3.6, 0.12, 0.42], [0, 3.28, 1.03], panelMat);
  addShellBox(cockpit, 'mainPanel', [5.2, 0.32, 1.55], [0, 2.9, 0.0], panelMat);
  addShellBox(cockpit, 'pfdCutout', [0.95, 0.08, 0.62], [-0.95, 3.08, 0.15], screenMat);
  addShellBox(cockpit, 'ndCutout', [0.95, 0.08, 0.62], [0.95, 3.08, 0.15], screenMat);
  addShellBox(cockpit, 'standbyDisplayCutout', [0.55, 0.08, 0.42], [0, 3.09, 0.15], screenMat);

  const controlColumn = addShellCylinder(cockpit, 'controlColumn', 0.08, 1.15, [0, 1.62, -0.43], controlMat);
  controlColumn.rotation.x = 0.35;
  addShellBox(cockpit, 'yoke', [1.15, 0.12, 0.5], [0, 2.0, 0.08], controlMat);
  addShellBox(cockpit, 'yokeCenterGrip', [0.22, 0.18, 0.72], [0, 2.07, 0.08], controlMat);

  addShellBox(cockpit, 'throttleQuadrant', [1.25, 1.35, 0.42], [0, 0.65, -0.45], panelMat);
  addShellBox(cockpit, 'throttleLever1', [0.16, 0.12, 0.75], [-0.2, 0.95, 0.05], controlMat);
  addShellBox(cockpit, 'throttleLever2', [0.16, 0.12, 0.75], [0.2, 0.95, 0.05], controlMat);
  addShellBox(cockpit, 'flapLever', [0.12, 0.1, 0.52], [0.55, 0.48, -0.05], controlMat);
  addShellBox(cockpit, 'speedbrakeLever', [0.1, 0.12, 0.48], [-0.55, 0.52, -0.05], controlMat);
  addShellBox(cockpit, 'gearLever', [0.16, 0.1, 0.48], [1.65, 2.76, -0.12], controlMat);

  addShellBox(cockpit, 'leftSeat', [1.05, 1.25, 0.6], [-1.25, -0.65, -0.75], seatMat);
  addShellBox(cockpit, 'leftSeatBack', [1.05, 0.25, 1.35], [-1.25, -1.2, 0.05], seatMat);
  addShellBox(cockpit, 'rightSeat', [1.05, 1.25, 0.6], [1.25, -0.65, -0.75], seatMat);
  addShellBox(cockpit, 'rightSeatBack', [1.05, 0.25, 1.35], [1.25, -1.2, 0.05], seatMat);

  attachCockpitInteractionMetadata(cockpit);

  return cockpit;
}
