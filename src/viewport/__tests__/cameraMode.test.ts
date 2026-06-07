import { describe, expect, it } from 'vitest';
import { shouldAutoFollowCamera, nextCameraMode } from '../cameraMode';

describe('shouldAutoFollowCamera', () => {
  it('auto-follows chase and cockpit modes even while paused or stopped', () => {
    expect(shouldAutoFollowCamera('running', 'chase')).toBe(true);
    expect(shouldAutoFollowCamera('running', 'cockpit')).toBe(true);
    expect(shouldAutoFollowCamera('paused', 'chase')).toBe(true);
    expect(shouldAutoFollowCamera('stopped', 'chase')).toBe(true);
    expect(shouldAutoFollowCamera('paused', 'cockpit')).toBe(true);
    expect(shouldAutoFollowCamera('stopped', 'cockpit')).toBe(true);
  });

  it('auto-follows tower framing even while paused or stopped', () => {
    expect(shouldAutoFollowCamera('running', 'tower')).toBe(true);
    expect(shouldAutoFollowCamera('paused', 'tower')).toBe(true);
    expect(shouldAutoFollowCamera('stopped', 'tower')).toBe(true);
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
