import * as THREE from 'three';

export function createBoeing737Model(): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.1 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3 });
  const engMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.6 });

  // Model axes intentionally match the local ENU frame used by three-to-cesium:
  // +Y forward/nose, +X right wing, +Z up. This keeps wheels below the airplane.

  // Fuselage (CylinderGeometry's height axis is local Y by default).
  const fuseGeo = new THREE.CylinderGeometry(3.8, 3.8, 40, 16);
  const fuse = new THREE.Mesh(fuseGeo, bodyMat);
  fuse.name = 'fuselage';
  group.add(fuse);

  // Nose cone points along local +Y by default.
  const noseGeo = new THREE.ConeGeometry(3.8, 8, 16);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.position.set(0, 24, 0);
  nose.name = 'nose';
  group.add(nose);

  // Tail cone needs to point aft (-Y).
  const tailConeGeo = new THREE.ConeGeometry(3.8, 6, 16);
  const tailCone = new THREE.Mesh(tailConeGeo, bodyMat);
  tailCone.rotation.x = Math.PI;
  tailCone.position.set(0, -23, 0);
  tailCone.name = 'tailCone';
  group.add(tailCone);

  // Main wings: span along +X/-X, chord along Y, thickness along Z.
  const wingGeo = new THREE.BoxGeometry(36, 6, 0.5);
  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.position.set(0, 1, -0.6);
  wing.name = 'mainWing';
  group.add(wing);

  // Vertical stabilizer: above fuselage at the aft end.
  const vstabGeo = new THREE.BoxGeometry(2, 7, 9);
  const vstab = new THREE.Mesh(vstabGeo, bodyMat);
  vstab.position.set(0, -18, 5);
  vstab.name = 'verticalStabilizer';
  group.add(vstab);

  // Horizontal stabilizer: lateral span, aft chord, thin vertical thickness.
  const hstabGeo = new THREE.BoxGeometry(16, 4, 0.4);
  const hstab = new THREE.Mesh(hstabGeo, bodyMat);
  hstab.position.set(0, -18, 1);
  hstab.name = 'horizontalStabilizer';
  group.add(hstab);

  // Engine nacelles: hang below the wing and align fore/aft.
  const engGeo = new THREE.CylinderGeometry(2.2, 2.4, 8, 16);
  [ -6, 6 ].forEach((x) => {
    const eng = new THREE.Mesh(engGeo, engMat);
    eng.position.set(x, 1, -3);
    eng.name = x < 0 ? 'leftEngine' : 'rightEngine';
    group.add(eng);
  });

  // Navigation lights (aviation convention: red left, green right, white tail).
  const leftNav = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
  );
  leftNav.position.set(-18, 1, -0.4);
  leftNav.name = 'leftNavLight';
  group.add(leftNav);

  const rightNav = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
  );
  rightNav.position.set(18, 1, -0.4);
  rightNav.name = 'rightNavLight';
  group.add(rightNav);

  const tailNav = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  tailNav.position.set(0, -23, 2);
  tailNav.name = 'tailNavLight';
  group.add(tailNav);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
  );
  beacon.position.set(0, -5, 4);
  beacon.name = 'beacon';
  group.add(beacon);

  const landLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffcc }),
  );
  landLight.position.set(0, 20, -2);
  landLight.name = 'landingLight';
  group.add(landLight);

  // Landing gear (simplified boxes): all below fuselage on negative Z.
  const gearMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const noseGear = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3), gearMat);
  noseGear.position.set(0, 18, -4);
  noseGear.name = 'noseGear';
  group.add(noseGear);

  const leftMain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3), gearMat);
  leftMain.position.set(-4, -2, -4);
  leftMain.name = 'leftMainGear';
  group.add(leftMain);

  const rightMain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3), gearMat);
  rightMain.position.set(4, -2, -4);
  rightMain.name = 'rightMainGear';
  group.add(rightMain);

  return group;
}
