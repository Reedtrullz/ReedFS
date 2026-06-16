import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pkg from '../../../package.json';
import { resolvePlaywrightWebServerEnv } from '../../../playwright.config';
import { isVisualTestMode } from '../visualTest';

describe('Playwright runtime modes', () => {
  it('keeps production-like e2e separate from visual snapshots', () => {
    const packageScripts = (pkg as { scripts: Record<string, string> }).scripts;

    expect(packageScripts['test:e2e']).toContain('playwright test');
    expect(packageScripts['test:e2e']).toContain('VITE_RFS_VISUAL_TEST=0');
    expect(packageScripts['test:e2e']).not.toContain('VITE_RFS_VISUAL_TEST=1');
    expect(packageScripts['test:visual']).toContain('VITE_RFS_VISUAL_TEST=1');
    expect(packageScripts['test:visual:update']).toContain('VITE_RFS_VISUAL_TEST=1');
  });

  it('passes visual env to the Playwright web server only for explicit visual mode', () => {
    expect(resolvePlaywrightWebServerEnv({ VITE_RFS_VISUAL_TEST: '1' })).toEqual({
      VITE_RFS_VISUAL_TEST: '1',
    });
    expect(resolvePlaywrightWebServerEnv({})).toBeUndefined();
    expect(resolvePlaywrightWebServerEnv({ VITE_RFS_VISUAL_TEST: '0' })).toBeUndefined();
    expect(resolvePlaywrightWebServerEnv({ VITE_RFS_VISUAL_TEST: 'true' })).toBeUndefined();
  });
});

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
