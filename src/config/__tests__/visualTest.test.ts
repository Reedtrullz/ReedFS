import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isVisualTestMode } from '../visualTest';

describe('visual test config', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_RFS_VISUAL_TEST', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats only explicit 1 as enabled', () => {
    expect(isVisualTestMode('1')).toBe(true);
    expect(isVisualTestMode('true')).toBe(false);
    expect(isVisualTestMode(undefined)).toBe(false);
  });

  it('reads visual mode from import.meta.env by default', () => {
    vi.stubEnv('VITE_RFS_VISUAL_TEST', '1');
    expect(isVisualTestMode()).toBe(true);

    vi.stubEnv('VITE_RFS_VISUAL_TEST', 'true');
    expect(isVisualTestMode()).toBe(false);
  });
});
