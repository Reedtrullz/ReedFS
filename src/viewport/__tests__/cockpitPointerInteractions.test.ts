import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cockpitInteractionAtCanvasPoint } from '../cockpitPointerInteractions';

function testCanvas(width = 100, height = 100): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return canvas;
}

describe('cockpit pointer interactions', () => {
  it('raycasts a pointer position to the nearest cockpit interaction metadata', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const lever = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    lever.userData.cockpitInteraction = {
      id: 'flap-lever',
      objectName: 'flapLever',
      label: 'Flap lever',
      hint: 'Click to cycle flap detents.',
      interactive: true,
    };
    scene.add(lever);
    scene.updateMatrixWorld(true);

    expect(cockpitInteractionAtCanvasPoint({ scene, camera, canvas: testCanvas() }, 50, 50)?.id).toBe('flap-lever');
  });

  it('walks up parent metadata so small child meshes remain clickable', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const leverGroup = new THREE.Group();
    leverGroup.userData.cockpitInteraction = {
      id: 'gear-lever',
      objectName: 'gearLever',
      label: 'Gear lever',
      hint: 'Click to toggle commanded gear position.',
      interactive: true,
    };
    const knob = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    leverGroup.add(knob);
    scene.add(leverGroup);
    scene.updateMatrixWorld(true);

    expect(cockpitInteractionAtCanvasPoint({ scene, camera, canvas: testCanvas() }, 50, 50)?.id).toBe('gear-lever');
  });
});
