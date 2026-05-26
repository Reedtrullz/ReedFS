import { Ion } from 'cesium';

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

/**
 * Normalize a Cesium Ion token and reject empty or placeholder values.
 */
export function normalizeCesiumToken(token?: string): string | null {
  const normalizedToken = token?.trim();

  if (!normalizedToken || PLACEHOLDER_TOKENS.has(normalizedToken)) {
    return null;
  }

  return normalizedToken;
}

/**
 * Resolve the Cesium scene policy from the configured Ion token.
 */
export function getCesiumScenePolicy(
  token: string | undefined = import.meta.env.VITE_CESIUM_ION_TOKEN,
): CesiumScenePolicy {
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
 * Initialize Cesium Ion with an access token.
 *
 * Get a free token at https://ion.cesium.com/signup
 * The free tier includes Cesium World Terrain + Bing Maps imagery.
 *
 * Store the token in VITE_CESIUM_ION_TOKEN env var (never commit).
 */
export function initCesium(token?: string): CesiumScenePolicy {
  const policy = getCesiumScenePolicy(token);
  Ion.defaultAccessToken = policy.token ?? '';
  return policy;
}

/**
 * Check if a valid Cesium Ion token is configured.
 */
export function hasCesiumToken(): boolean {
  return normalizeCesiumToken(Ion.defaultAccessToken) !== null;
}
