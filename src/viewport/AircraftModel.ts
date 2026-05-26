import * as THREE from 'three';

function addBox(
  parent: THREE.Object3D,
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Object3D,
  name: string,
  radiusTop: number,
  radiusBottom: number,
  length: number,
  position: [number, number, number],
  material: THREE.Material,
  radialSegments = 20,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addSphere(
  parent: THREE.Object3D,
  name: string,
  radius: number,
  position: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), material);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function createPivotGroup(parent: THREE.Object3D, name: string, position: [number, number, number]): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  return group;
}

export function createBoeing737Model(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'boeing737ProceduralModel';

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.42, metalness: 0.08 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xd5d9dd, roughness: 0.45, metalness: 0.05 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.33, metalness: 0.05 });
  const controlMat = new THREE.MeshStandardMaterial({ color: 0xb7bdc3, roughness: 0.36, metalness: 0.04 });
  const engineMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.32, metalness: 0.55 });
  const fanMat = new THREE.MeshStandardMaterial({ color: 0x1d2429, roughness: 0.25, metalness: 0.75 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x10202e, roughness: 0.12, metalness: 0.05 });
  const gearMat = new THREE.MeshStandardMaterial({ color: 0x686868, roughness: 0.5, metalness: 0.3 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.7 });

  // Model axes intentionally match the local ENU frame used by three-to-cesium:
  // +Y forward/nose, +X right wing, +Z up. Dimensions are meters-ish and keep
  // the origin near the aircraft CG / wing box for stable camera and animation math.

  // Fuselage: 737-like tube plus short nose/tail cones. CylinderGeometry's height axis is local Y.
  addCylinder(group, 'fuselage', 2.05, 2.05, 33, [0, 0, 0], bodyMat, 24);
  addBox(group, 'bellyFairing', [3.1, 7.5, 0.7], [0, -0.8, -2.15], bellyMat);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.05, 4.8, 24), bodyMat);
  nose.name = 'nose';
  nose.position.set(0, 18.9, 0);
  group.add(nose);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4.2, 20), bodyMat);
  tailCone.name = 'tailCone';
  tailCone.rotation.x = Math.PI;
  tailCone.position.set(0, -18.6, 0);
  group.add(tailCone);

  addBox(group, 'cockpitWindows', [2.6, 0.22, 0.72], [0, 19.8, 1.15], glassMat);

  // Main wings are separate named objects so visual state can address each side independently.
  addBox(group, 'leftWing', [16.2, 4.8, 0.32], [-9.65, 0.4, -0.45], wingMat);
  addBox(group, 'rightWing', [16.2, 4.8, 0.32], [9.65, 0.4, -0.45], wingMat);

  const leftFlap = createPivotGroup(group, 'leftFlap', [-6.7, -2.35, -0.55]);
  addBox(leftFlap, 'leftFlapPanel', [7.2, 1.1, 0.18], [0, -0.55, 0], controlMat);

  const rightFlap = createPivotGroup(group, 'rightFlap', [6.7, -2.35, -0.55]);
  addBox(rightFlap, 'rightFlapPanel', [7.2, 1.1, 0.18], [0, -0.55, 0], controlMat);

  const leftAileron = createPivotGroup(group, 'leftAileron', [-14.2, -2.15, -0.5]);
  addBox(leftAileron, 'leftAileronPanel', [3.7, 0.9, 0.16], [0, -0.45, 0], controlMat);

  const rightAileron = createPivotGroup(group, 'rightAileron', [14.2, -2.15, -0.5]);
  addBox(rightAileron, 'rightAileronPanel', [3.7, 0.9, 0.16], [0, -0.45, 0], controlMat);

  // Tail surfaces and hinge-friendly control groups.
  addBox(group, 'horizontalStabilizer', [14.6, 3.4, 0.26], [0, -15.1, 1.25], wingMat);

  const leftElevator = createPivotGroup(group, 'leftElevator', [-3.9, -16.55, 1.22]);
  addBox(leftElevator, 'leftElevatorPanel', [6.0, 0.95, 0.15], [0, -0.45, 0], controlMat);

  const rightElevator = createPivotGroup(group, 'rightElevator', [3.9, -16.55, 1.22]);
  addBox(rightElevator, 'rightElevatorPanel', [6.0, 0.95, 0.15], [0, -0.45, 0], controlMat);

  addBox(group, 'verticalStabilizer', [1.4, 4.0, 6.2], [0, -15.6, 4.25], bodyMat);

  const rudder = createPivotGroup(group, 'rudder', [0, -17.2, 5.7]);
  addBox(rudder, 'rudderPanel', [1.1, 0.85, 3.8], [0, -0.45, 0], controlMat);

  // Engine nacelles and explicit fan discs. Nacelle groups stay named left/rightEngine for existing tests.
  const enginePositions: Array<[string, string, number]> = [
    ['leftEngine', 'leftFan', -6.4],
    ['rightEngine', 'rightFan', 6.4],
  ];
  enginePositions.forEach(([engineName, fanName, x]) => {
    const engine = createPivotGroup(group, engineName, [x, 0.6, -2.35]);
    addCylinder(engine, `${engineName}Nacelle`, 1.05, 1.18, 3.8, [0, 0, 0], engineMat, 20);

    addCylinder(engine, fanName, 0.86, 0.86, 0.12, [0, 1.95, 0], fanMat, 16);
  });

  // Landing gear groups. Wheels are separate meshes but kept inside their named gear assemblies.
  const noseGear = createPivotGroup(group, 'noseGear', [0, 15.0, -3.35]);
  addBox(noseGear, 'noseStrut', [0.28, 0.28, 2.2], [0, 0, -0.65], gearMat);
  addBox(noseGear, 'noseWheel', [0.62, 0.26, 0.62], [0, 0.05, -1.85], tireMat);

  const leftMainGear = createPivotGroup(group, 'leftMainGear', [-3.85, -1.8, -3.45]);
  addBox(leftMainGear, 'leftMainStrut', [0.32, 0.32, 2.1], [0, 0, -0.6], gearMat);
  addBox(leftMainGear, 'leftMainWheel', [0.82, 0.32, 0.82], [0, 0.05, -1.78], tireMat);

  const rightMainGear = createPivotGroup(group, 'rightMainGear', [3.85, -1.8, -3.45]);
  addBox(rightMainGear, 'rightMainStrut', [0.32, 0.32, 2.1], [0, 0, -0.6], gearMat);
  addBox(rightMainGear, 'rightMainWheel', [0.82, 0.32, 0.82], [0, 0.05, -1.78], tireMat);

  // Navigation/landing lights are grouped for bulk animation while retaining named child lights.
  const lights = new THREE.Group();
  lights.name = 'lights';
  group.add(lights);

  addSphere(lights, 'leftNavLight', 0.22, [-17.9, 0.15, -0.35], new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  addSphere(lights, 'rightNavLight', 0.22, [17.9, 0.15, -0.35], new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  addSphere(lights, 'tailNavLight', 0.2, [0, -20.25, 0.55], new THREE.MeshBasicMaterial({ color: 0xffffff }));
  addSphere(lights, 'beacon', 0.24, [0, -4.5, 2.25], new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  addSphere(lights, 'landingLight', 0.22, [0, 17.4, -1.35], new THREE.MeshBasicMaterial({ color: 0xffffcc }));

  return group;
}
