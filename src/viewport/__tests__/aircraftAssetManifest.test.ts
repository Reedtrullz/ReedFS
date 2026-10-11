import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBoeing737Model } from '../AircraftModel';
import { BOEING_737_MODEL_MANIFEST, validateAircraftModelManifest } from '../aircraftAssetManifest';

describe('validateAircraftModelManifest', () => {
  it('admits the current Boeing procedural model with no violations', () => {
    const violations = validateAircraftModelManifest(createBoeing737Model(), BOEING_737_MODEL_MANIFEST);

    expect(violations).toEqual([]);
  });

  it('reports every missing required node on an incomplete model', () => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry()));

    const violations = validateAircraftModelManifest(model, BOEING_737_MODEL_MANIFEST);

    expect(violations.some((violation) => violation === 'missing required node: fuselage')).toBe(true);
    expect(violations.some((violation) => violation === 'missing required node: lights')).toBe(true);
  });

  it('rejects an empty model as outside every declared contract', () => {
    const violations = validateAircraftModelManifest(new THREE.Group(), BOEING_737_MODEL_MANIFEST);

    expect(violations).toContain('model bounds are empty or non-finite');
  });
});
