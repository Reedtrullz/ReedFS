import { describe, expect, it, vi } from 'vitest';
import {
  AdaptiveQuality,
  QUALITY_LEVELS,
  applyQualityLevel,
  fixedLevelFor,
  frameRateFor,
  parseQualitySetting,
} from '../renderQuality';

function run(controller: AdaptiveQuality, fromMs: number, toMs: number, frameMs: number): void {
  for (let t = fromMs; t <= toMs; t += frameMs) controller.onFrame(t);
}

describe('AdaptiveQuality', () => {
  it('stays at the starting level when frames are fast', () => {
    const onLevelChange = vi.fn();
    const controller = new AdaptiveQuality({ onLevelChange });
    run(controller, 0, 60_000, 16.7);
    expect(onLevelChange).not.toHaveBeenCalled();
  });

  it('ignores slow frames during warmup', () => {
    const onLevelChange = vi.fn();
    const controller = new AdaptiveQuality({ onLevelChange });
    run(controller, 0, 7_900, 50);
    expect(onLevelChange).not.toHaveBeenCalled();
  });

  it('steps down after sustained slow windows and stops at the last level', () => {
    const onLevelChange = vi.fn();
    const controller = new AdaptiveQuality({ onLevelChange });
    run(controller, 0, 120_000, 50);
    expect(onLevelChange.mock.calls.map(([level]) => level)).toEqual([1, 2, 3]);
    expect(controller.level).toBe(QUALITY_LEVELS.length - 1);
  });

  it('does not count isolated stalls toward degradation', () => {
    const onLevelChange = vi.fn();
    const controller = new AdaptiveQuality({ onLevelChange });
    run(controller, 0, 10_000, 16.7);
    controller.onFrame(13_000);
    run(controller, 13_016.7, 60_000, 16.7);
    expect(onLevelChange).not.toHaveBeenCalled();
  });
});

describe('quality settings', () => {
  it('parses the quality query parameter', () => {
    expect(parseQualitySetting('?quality=low')).toBe('low');
    expect(parseQualitySetting('?quality=bogus')).toBe('auto');
    expect(parseQualitySetting('')).toBe('auto');
    expect(fixedLevelFor('auto')).toBeNull();
    expect(fixedLevelFor('low')).toBe(QUALITY_LEVELS.length - 1);
  });

  it('caps frame rate at 30 only for pinned low quality', () => {
    expect(frameRateFor('low')).toBe(30);
    expect(frameRateFor('medium')).toBe(60);
    expect(frameRateFor('high')).toBe(60);
    expect(frameRateFor('auto')).toBe(60);
  });

  it('applies a level to the viewer and buildings', () => {
    const viewer = {
      resolutionScale: 1,
      scene: {
        msaaSamples: 4,
        globe: { maximumScreenSpaceError: 2, showWaterEffect: true },
        postProcessStages: { fxaa: { enabled: false } },
      },
    };
    const buildings = { maximumScreenSpaceError: 16, show: true };
    applyQualityLevel(viewer, buildings, 3);
    expect(viewer.resolutionScale).toBe(0.55);
    expect(viewer.scene.msaaSamples).toBe(1);
    expect(viewer.scene.postProcessStages.fxaa.enabled).toBe(true);
    expect(viewer.scene.globe.showWaterEffect).toBe(false);
    expect(buildings.show).toBe(false);
  });
});
