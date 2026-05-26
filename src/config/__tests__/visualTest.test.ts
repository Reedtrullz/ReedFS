import { describe, expect, it } from 'vitest';
import { isVisualTestMode } from '../visualTest';

describe('visual test config', () => {
  it('treats only explicit 1 as enabled', () => {
    expect(isVisualTestMode('1')).toBe(true);
    expect(isVisualTestMode('true')).toBe(false);
    expect(isVisualTestMode(undefined)).toBe(false);
  });
});
