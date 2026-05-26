import { beforeEach, describe, expect, it } from 'vitest';
import { Ion } from 'cesium';
import { getCesiumScenePolicy, hasCesiumToken, initCesium, normalizeCesiumToken } from '../cesium';

describe('cesium scene policy', () => {
  beforeEach(() => {
    Ion.defaultAccessToken = '';
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

  it('reports ion mode and initializes Ion when a token is configured', () => {
    const policy = initCesium('test-token-123');
    expect(policy.mode).toBe('ion');
    expect(policy.terrain).toBe('world');
    expect(policy.osmBuildings).toBe(true);
    expect(Ion.defaultAccessToken).toBe('test-token-123');
    expect(hasCesiumToken()).toBe(true);
  });
});
