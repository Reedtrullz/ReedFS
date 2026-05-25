/// <reference types="vite/client" />

declare module 'three-to-cesium' {
  import * as Cesium from 'cesium';
  import * as THREE from 'three';

  interface ThreeToCesiumOptions {
    cameraFar?: number;
    cameraNear?: number;
  }

  interface ThreeToCesiumInstance {
    add(object: THREE.Object3D, position: Cesium.Cartesian3): void;
    update(): void;
    destroy(): void;
    threeScene: THREE.Scene;
    threeCamera: THREE.Camera;
    threeRenderer: THREE.WebGLRenderer;
  }

  function ThreeToCesium(
    viewer: Cesium.Viewer,
    options?: ThreeToCesiumOptions
  ): ThreeToCesiumInstance;

  export default ThreeToCesium;
}
