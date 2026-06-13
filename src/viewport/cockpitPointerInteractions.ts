import * as THREE from 'three';
import type { CockpitInteractionActivationResult, CockpitInteractionId, CockpitInteractionMetadata } from './cockpitInteractions';

export interface CockpitPointerScene {
  scene: THREE.Scene;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
}

export interface CockpitPointerInstallOptions extends CockpitPointerScene {
  onActivate: (interactionId: CockpitInteractionId) => CockpitInteractionActivationResult;
}

function normalizedPointer(canvas: HTMLCanvasElement, clientX: number, clientY: number): THREE.Vector2 {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.clientWidth || 1;
  const height = rect.height || canvas.clientHeight || 1;
  return new THREE.Vector2(
    ((clientX - rect.left) / width) * 2 - 1,
    -(((clientY - rect.top) / height) * 2 - 1),
  );
}

function metadataForObject(object: THREE.Object3D): CockpitInteractionMetadata | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    const metadata = current.userData?.cockpitInteraction as CockpitInteractionMetadata | undefined;
    if (metadata?.interactive) return metadata;
    current = current.parent;
  }
  return undefined;
}

export function cockpitInteractionAtCanvasPoint(
  target: CockpitPointerScene,
  clientX: number,
  clientY: number,
): CockpitInteractionMetadata | undefined {
  const pointer = normalizedPointer(target.canvas, clientX, clientY);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, target.camera);
  const intersections = raycaster.intersectObjects(target.scene.children, true);

  for (const intersection of intersections) {
    const metadata = metadataForObject(intersection.object);
    if (metadata) return metadata;
  }

  return undefined;
}

export function installCockpitPointerInteractions(options: CockpitPointerInstallOptions): () => void {
  const previousPointerEvents = options.canvas.style.pointerEvents;
  options.canvas.style.pointerEvents = 'auto';

  const onPointerDown = (event: PointerEvent) => {
    const interaction = cockpitInteractionAtCanvasPoint(options, event.clientX, event.clientY);
    if (!interaction) return;
    const activation = options.onActivate(interaction.id);
    if (activation.status !== 'applied' && activation.status !== 'unavailable') return;
    event.preventDefault();
    event.stopPropagation();
  };

  options.canvas.addEventListener('pointerdown', onPointerDown);

  return () => {
    options.canvas.removeEventListener('pointerdown', onPointerDown);
    options.canvas.style.pointerEvents = previousPointerEvents;
  };
}
