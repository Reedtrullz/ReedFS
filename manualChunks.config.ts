export const RFS_BUNDLE_BUDGET_CATEGORIES = [
  'app',
  'vendorReact',
  'vendor',
  'three',
  'threeBridge',
  'cesium',
] as const;

export type RfsBundleBudgetCategory = typeof RFS_BUNDLE_BUDGET_CATEGORIES[number];

export function rfsManualChunk(id: string): string | undefined {
  const moduleId = id.replace(/\\/g, '/');

  if (!moduleId.includes('/node_modules/')) return undefined;
  if (moduleId.includes('/node_modules/cesium/')) return 'cesium';
  if (moduleId.includes('/node_modules/three-to-cesium/')) return 'three-bridge';
  if (moduleId.includes('/node_modules/three/')) return 'three';
  if (
    moduleId.includes('/node_modules/react/') ||
    moduleId.includes('/node_modules/react-dom/') ||
    moduleId.includes('/node_modules/zustand/') ||
    moduleId.includes('/node_modules/@vitejs/')
  ) {
    return 'vendor-react';
  }

  return 'vendor';
}
