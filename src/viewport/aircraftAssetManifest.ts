import * as THREE from 'three';

/** Declares the structural contract a swap-in aircraft model must satisfy before admission. */
export interface AircraftModelManifest {
  /** Model authoring scale; RFS renders exterior models in meters. */
  unit: 'meters';
  /** Local model axes in the three-to-cesium ENU convention. */
  forwardAxis: '+Y';
  upAxis: '+Z';
  /** Typical pilot eye height above the model origin, in meters. */
  eyePointMeters: [number, number, number];
  /** Nodes that visual state and animation code address by name; missing nodes fail admission. */
  requiredNodes: readonly string[];
  /** Upper bound on unique materials admitted for one aircraft model. */
  materialBudget: number;
  /** SPDX identifiers covering every material and geometry in the model. */
  licenses: readonly string[];
}

/** Contract for the current Boeing 737-800 procedural exterior model. */
export const BOEING_737_MODEL_MANIFEST: AircraftModelManifest = {
  unit: 'meters',
  forwardAxis: '+Y',
  upAxis: '+Z',
  eyePointMeters: [0, 0, 1.35],
  requiredNodes: [
    'fuselage',
    'leftWing',
    'rightWing',
    'leftEngine',
    'rightEngine',
    'leftFan',
    'rightFan',
    'noseGear',
    'leftMainGear',
    'rightMainGear',
    'leftFlap',
    'rightFlap',
    'leftAileron',
    'rightAileron',
    'leftElevator',
    'rightElevator',
    'rudder',
    'lights',
    'leftNavLight',
    'rightNavLight',
    'tailNavLight',
    'beacon',
    'landingLight',
  ],
  materialBudget: 16,
  licenses: ['GPL-3.0-or-later'],
};

/** Returns every violated manifest clause; an empty array admits the model. */
export function validateAircraftModelManifest(
  model: THREE.Object3D,
  manifest: AircraftModelManifest,
): string[] {
  const violations: string[] = [];
  for (const node of manifest.requiredNodes) {
    if (!model.getObjectByName(node)) violations.push(`missing required node: ${node}`);
  }

  const materials = new Set<THREE.Material>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    const owned = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of owned) materials.add(material);
  });
  if (materials.size > manifest.materialBudget) {
    violations.push(`material budget exceeded: ${materials.size} > ${manifest.materialBudget}`);
  }

  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (!isFiniteBounds(bounds)) {
    violations.push('model bounds are empty or non-finite');
  } else if (!bounds.containsPoint(new THREE.Vector3(...manifest.eyePointMeters))) {
    violations.push('eye point lies outside model bounds');
  }

  return violations;
}

function isFiniteBounds(bounds: THREE.Box3): boolean {
  return Number.isFinite(bounds.min.x) && Number.isFinite(bounds.min.y) && Number.isFinite(bounds.min.z)
    && Number.isFinite(bounds.max.x) && Number.isFinite(bounds.max.y) && Number.isFinite(bounds.max.z)
    && !bounds.isEmpty();
}
