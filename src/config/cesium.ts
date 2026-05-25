import { Ion } from 'cesium';

/**
 * Initialize Cesium Ion with an access token.
 *
 * Get a free token at https://ion.cesium.com/signup
 * The free tier includes Cesium World Terrain + Bing Maps imagery.
 *
 * Store the token in VITE_CESIUM_ION_TOKEN env var (never commit).
 */
export function initCesium(token?: string): void {
  const t = token ?? import.meta.env.VITE_CESIUM_ION_TOKEN;
  if (t) {
    Ion.defaultAccessToken = t;
  }
}

/**
 * Check if a valid Cesium Ion token is configured.
 */
export function hasCesiumToken(): boolean {
  return Boolean(Ion.defaultAccessToken);
}
