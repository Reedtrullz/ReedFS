import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCesiumScenePolicy, hasCesiumToken, initCesium, normalizeCesiumToken } from '../cesium';

describe('cesium scene policy', () => {
  beforeEach(() => {
    initCesium('');
    vi.stubEnv('VITE_RFS_VISUAL_TEST', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('normalizes empty and placeholder tokens as missing', () => {
    expect(normalizeCesiumToken(undefined)).toBeNull();
    expect(normalizeCesiumToken('')).toBeNull();
    expect(normalizeCesiumToken('   ')).toBeNull();
    expect(normalizeCesiumToken('YOUR_CESIUM_ION_TOKEN')).toBeNull();
    expect(normalizeCesiumToken('[REDACTED]')).toBeNull();
  });

  it('reports degraded mode when no usable token is configured', () => {
    const policy = getCesiumScenePolicy('');
    expect(policy.mode).toBe('degraded');
    expect(policy.terrain).toBe('ellipsoid');
    expect(policy.osmBuildings).toBe(false);
    expect(policy.reason).toContain('VITE_CESIUM_ION_TOKEN');
  });

  it('reports ion mode and records a configured token without importing Cesium', () => {
    const policy = initCesium('test-token-123');
    expect(policy.mode).toBe('ion');
    expect(policy.terrain).toBe('world');
    expect(policy.osmBuildings).toBe(true);
    expect(hasCesiumToken()).toBe(true);
  });

  it('forces degraded deterministic scenery in visual test mode even with an Ion token', () => {
    vi.stubEnv('VITE_RFS_VISUAL_TEST', '1');

    const policy = initCesium('test-token-123');

    expect(policy).toMatchObject({
      mode: 'degraded',
      terrain: 'ellipsoid',
      osmBuildings: false,
      token: null,
    });
    expect(policy.reason).toMatch(/visual test/i);
    expect(hasCesiumToken()).toBe(false);
  });
});
