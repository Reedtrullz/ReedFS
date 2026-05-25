import * as THREE from 'three';

export function createBoeing737Model(): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.1 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3 });
  const engMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.6 });

  // Fuselage
  const fuseGeo = new THREE.CylinderGeometry(3.8, 3.8, 40, 16);
  const fuse = new THREE.Mesh(fuseGeo, bodyMat);
  fuse.rotation.x = Math.PI / 2;
  group.add(fuse);

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(3.8, 8, 16);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, 24);
  group.add(nose);

  // Tail cone
  const tailConeGeo = new THREE.ConeGeometry(3.8, 6, 16);
  const tailCone = new THREE.Mesh(tailConeGeo, bodyMat);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.set(0, 0, -23);
  group.add(tailCone);

  // Main wings
  const wingGeo = new THREE.BoxGeometry(36, 0.5, 6);
  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.position.set(0, -1.5, 0);
  group.add(wing);

  // Vertical stabilizer
  const vstabGeo = new THREE.BoxGeometry(12, 0.4, 2);
  const vstab = new THREE.Mesh(vstabGeo, bodyMat);
  vstab.position.set(0, 5, -18);
  group.add(vstab);

  // Horizontal stabilizer
  const hstabGeo = new THREE.BoxGeometry(16, 0.3, 4);
  const hstab = new THREE.Mesh(hstabGeo, bodyMat);
  hstab.position.set(0, 0.5, -18);
  group.add(hstab);

  // Engine nacelles
  const engGeo = new THREE.CylinderGeometry(2.2, 2.4, 8, 16);
  [ -6, 6 ].forEach((x) => {
    const eng = new THREE.Mesh(engGeo, engMat);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(x, -3, -2);
    group.add(eng);
  });

  // Navigation lights (emissive spheres)
  const leftNav = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
  );
  leftNav.position.set(-18, -1.5, -1);
  group.add(leftNav);

  const rightNav = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
  );
  rightNav.position.set(18, -1.5, -1);
  group.add(rightNav);

  const tailNav = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  tailNav.position.set(0, 5, -21);
  group.add(tailNav);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
  );
  beacon.position.set(0, 4, -5);
  group.add(beacon);

  const landLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffcc }),
  );
  landLight.position.set(0, -2, 20);
  group.add(landLight);

  return group;
}
