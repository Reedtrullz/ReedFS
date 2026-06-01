import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import path from 'path';

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../RFMS/shared/src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    // NOTE: Do NOT add COOP/COEP headers (Cross-Origin-Opener-Policy /
    // Cross-Origin-Embedder-Policy). They block Cesium Ion's cross-origin
    // tile requests to api.cesium.com and assets.ion.cesium.com.
    // SharedArrayBuffer is not currently required by any RFS subsystem.
  },
  build: {
    target: 'esnext',
  },
});
