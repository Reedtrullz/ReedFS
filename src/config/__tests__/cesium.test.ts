import { describe, it, expect, beforeEach } from 'vitest';
import { Ion } from 'cesium';
import { initCesium, hasCesiumToken } from '../cesium';

describe('initCesium', () => {
  beforeEach(() => {
    // Reset token between tests
    Ion.defaultAccessToken = '';
  });

  it('sets the token when provided directly', () => {
    initCesium('test-token-123');
    expect(Ion.defaultAccessToken).toBe('test-token-123');
    expect(hasCesiumToken()).toBe(true);
  });

  it('returns false when no token is set', () => {
    expect(hasCesiumToken()).toBe(false);
  });
});
