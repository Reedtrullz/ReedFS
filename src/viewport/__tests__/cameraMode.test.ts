import { describe, expect, it } from 'vitest';
import { shouldAutoFollowCamera, nextCameraMode } from '../cameraMode';

describe('shouldAutoFollowCamera', () => {
  it('follows only while running for chase and cockpit modes', () => {
    expect(shouldAutoFollowCamera('running', 'chase')).toBe(true);
    expect(shouldAutoFollowCamera('running', 'cockpit')).toBe(true);
    expect(shouldAutoFollowCamera('paused', 'chase')).toBe(false);
    expect(shouldAutoFollowCamera('stopped', 'chase')).toBe(false);
    expect(shouldAutoFollowCamera('paused', 'cockpit')).toBe(false);
    expect(shouldAutoFollowCamera('stopped', 'cockpit')).toBe(false);
  });

  it('allows tower framing only while running', () => {
    expect(shouldAutoFollowCamera('running', 'tower')).toBe(true);
    expect(shouldAutoFollowCamera('paused', 'tower')).toBe(false);
    expect(shouldAutoFollowCamera('stopped', 'tower')).toBe(false);
  });

  it('never auto-follows in free mode, even while running', () => {
    expect(shouldAutoFollowCamera('running', 'free')).toBe(false);
    expect(shouldAutoFollowCamera('paused', 'free')).toBe(false);
    expect(shouldAutoFollowCamera('stopped', 'free')).toBe(false);
  });

  it('cycles through follow and free modes predictably', () => {
    expect(nextCameraMode('chase')).toBe('cockpit');
    expect(nextCameraMode('cockpit')).toBe('tower');
    expect(nextCameraMode('tower')).toBe('free');
    expect(nextCameraMode('free')).toBe('chase');
  });
});
