import { describe, expect, it } from 'vitest';
import { rfsManualChunk } from '../../../manualChunks.config';

describe('RFS manual chunk policy', () => {
  it('pins Cesium and Three-heavy dependencies into explicit chunks', () => {
    expect(rfsManualChunk('/repo/node_modules/cesium/Build/Cesium/index.js')).toBe('cesium');
    expect(rfsManualChunk('/repo/node_modules/three/src/Three.js')).toBe('three');
    expect(rfsManualChunk('/repo/node_modules/three-to-cesium/dist/index.js')).toBe('three-bridge');
  });

  it('keeps framework deps separate from generic vendor code and leaves app code automatic', () => {
    expect(rfsManualChunk('/repo/node_modules/react/index.js')).toBe('vendor-react');
    expect(rfsManualChunk('/repo/node_modules/zustand/esm/index.mjs')).toBe('vendor-react');
    expect(rfsManualChunk('/repo/node_modules/lodash-es/lodash.js')).toBe('vendor');
    expect(rfsManualChunk('/repo/src/App.tsx')).toBeUndefined();
  });
});
