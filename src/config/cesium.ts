import { isVisualTestMode } from './visualTest';

export type CesiumSceneMode = 'ion' | 'degraded';
export type CesiumTerrainMode = 'world' | 'ellipsoid';

export interface CesiumScenePolicy {
  mode: CesiumSceneMode;
  terrain: CesiumTerrainMode;
  osmBuildings: boolean;
  token: string | null;
  reason: string | null;
}

const PLACEHOLDER_TOKENS = new Set(['YOUR_CESIUM_ION_TOKEN', '[REDACTED]', 'REDACTED']);
let lastResolvedIonToken: string | null = null;

/**
 * Normalize a Cesium Ion token and reject empty or placeholder values.
 */
export function normalizeCesiumToken(token?: string | null): string | null {
  const normalizedToken = token?.trim();

  if (!normalizedToken || PLACEHOLDER_TOKENS.has(normalizedToken)) {
    return null;
  }

  return normalizedToken;
}

/**
 * Resolve the Cesium scene policy from the configured Ion token without importing
 * Cesium into the main app chunk. The viewport layer applies the token after the
 * lazily-loaded Cesium module is available.
 */
export function getCesiumScenePolicy(
  token: string | undefined = import.meta.env.VITE_CESIUM_ION_TOKEN,
): CesiumScenePolicy {
  if (isVisualTestMode()) {
    return {
      mode: 'degraded',
      terrain: 'ellipsoid',
      osmBuildings: false,
      token: null,
      reason: 'Visual test mode forces deterministic degraded scenery.',
    };
  }

  const normalizedToken = normalizeCesiumToken(token);

  if (normalizedToken) {
    return {
      mode: 'ion',
      terrain: 'world',
      osmBuildings: true,
      token: normalizedToken,
      reason: null,
    };
  }

  return {
    mode: 'degraded',
    terrain: 'ellipsoid',
    osmBuildings: false,
    token: null,
    reason: 'VITE_CESIUM_ION_TOKEN is not configured with a usable Cesium Ion token.',
  };
}

/**
 * Backwards-compatible policy initializer. This intentionally does not import
 * Cesium; callers that already own the Cesium module must apply the token with
 * `rememberCesiumIonToken(policy.token)` and `Ion.defaultAccessToken = ...`.
 */
export function initCesium(token?: string): CesiumScenePolicy {
  const policy = getCesiumScenePolicy(token);
  rememberCesiumIonToken(policy.token);
  return policy;
}

export function rememberCesiumIonToken(token: string | null): void {
  lastResolvedIonToken = normalizeCesiumToken(token);
}

/**
 * Check if a valid Cesium Ion token has been resolved for the current scene policy.
 */
export function hasCesiumToken(): boolean {
  return lastResolvedIonToken !== null;
}
