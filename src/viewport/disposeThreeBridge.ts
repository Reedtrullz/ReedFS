import type ThreeToCesium from 'three-to-cesium';

/** Release the renderer and its native context, including after Cesium detached its container. */
export function disposeThreeBridge(bridge: ReturnType<typeof ThreeToCesium>): void {
  const renderer = bridge.threeRenderer;
  try {
    bridge.destroy();
  } finally {
    // Detach first so intentional retirement cannot report a loss to the current scene.
    renderer.domElement.remove();
    renderer.forceContextLoss();
  }
}
