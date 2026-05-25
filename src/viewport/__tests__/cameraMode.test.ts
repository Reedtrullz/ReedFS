import { describe, expect, it } from 'vitest';
import { shouldAutoFollowCamera } from '../cameraMode';

describe('shouldAutoFollowCamera', () => {
  it('follows only while running for chase and cockpit modes', () => {
    expect(shouldAutoFollowCamera('running', 'chase')).toBe(true);
    expect(shouldAutoFollowCamera('running', 'cockpit')).toBe(true);
    expect(shouldAutoFollowCamera('paused', 'chase')).toBe(false);
    expect(shouldAutoFollowCamera('stopped', 'cockpit')).toBe(false);
  });

  it('allows tower framing only while running', () => {
    expect(shouldAutoFollowCamera('running', 'tower')).toBe(true);
    expect(shouldAutoFollowCamera('paused', 'tower')).toBe(false);
    expect(shouldAutoFollowCamera('stopped', 'tower')).toBe(false);
  });
});
