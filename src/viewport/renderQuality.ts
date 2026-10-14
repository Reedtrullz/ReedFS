export interface QualityLevel {
  resolutionScale: number;
  globeSse: number;
  msaaSamples: number;
  waterEffect: boolean;
  buildingsSse: number;
  buildingsVisible: boolean;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { resolutionScale: 1, globeSse: 3, msaaSamples: 2, waterEffect: true, buildingsSse: 24, buildingsVisible: true },
  { resolutionScale: 0.85, globeSse: 5, msaaSamples: 1, waterEffect: false, buildingsSse: 40, buildingsVisible: true },
  { resolutionScale: 0.7, globeSse: 8, msaaSamples: 1, waterEffect: false, buildingsSse: 80, buildingsVisible: true },
  { resolutionScale: 0.55, globeSse: 12, msaaSamples: 1, waterEffect: false, buildingsSse: 80, buildingsVisible: false },
];

/** Cap rendering at 60 fps; ProMotion displays otherwise render at 120 Hz. */
export const TARGET_FRAME_RATE = 60;

export type QualitySetting = 'auto' | 'high' | 'medium' | 'low';

const FIXED_LEVEL: Record<Exclude<QualitySetting, 'auto'>, number> = { high: 0, medium: 1, low: 3 };

export function parseQualitySetting(search: string): QualitySetting {
  const value = new URLSearchParams(search).get('quality');
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'auto';
}

export function fixedLevelFor(setting: QualitySetting): number | null {
  return setting === 'auto' ? null : FIXED_LEVEL[setting];
}

export interface AdaptiveQualityOptions {
  onLevelChange: (level: number) => void;
  maxLevel?: number;
  warmupMs?: number;
  windowMs?: number;
  slowFrameMs?: number;
  slowWindows?: number;
  stallMs?: number;
}

/**
 * Degrade-only controller: feed it a timestamp per rendered frame. Stepping
 * back up is deliberately not attempted, since it would oscillate around the
 * frame time that caused the step down.
 */
export class AdaptiveQuality {
  level: number;
  readonly #opts: Required<AdaptiveQualityOptions>;
  #startedAt: number | null = null;
  #lastTimestamp: number | null = null;
  #windowStart = 0;
  #windowTotal = 0;
  #windowFrames = 0;
  #slowStreak = 0;

  constructor(options: AdaptiveQualityOptions, initialLevel = 0) {
    this.#opts = {
      maxLevel: QUALITY_LEVELS.length - 1,
      warmupMs: 8000,
      windowMs: 2000,
      slowFrameMs: 25,
      slowWindows: 2,
      stallMs: 250,
      ...options,
    };
    this.level = initialLevel;
  }

  onFrame(timestampMs: number): void {
    const last = this.#lastTimestamp;
    this.#lastTimestamp = timestampMs;
    if (this.#startedAt === null) this.#startedAt = timestampMs;
    if (last === null || this.level >= this.#opts.maxLevel) return;
    if (timestampMs - this.#startedAt < this.#opts.warmupMs) {
      this.#windowStart = timestampMs;
      return;
    }

    const dt = timestampMs - last;
    if (dt <= this.#opts.stallMs) {
      this.#windowTotal += dt;
      this.#windowFrames += 1;
    }

    if (timestampMs - this.#windowStart < this.#opts.windowMs) return;
    const mean = this.#windowFrames > 0 ? this.#windowTotal / this.#windowFrames : 0;
    this.#windowStart = timestampMs;
    this.#windowTotal = 0;
    this.#windowFrames = 0;

    this.#slowStreak = mean > this.#opts.slowFrameMs ? this.#slowStreak + 1 : 0;
    if (this.#slowStreak >= this.#opts.slowWindows) {
      this.#slowStreak = 0;
      this.level += 1;
      this.#opts.onLevelChange(this.level);
    }
  }
}

interface QualityViewer {
  resolutionScale?: number;
  scene: {
    msaaSamples?: number;
    globe?: { maximumScreenSpaceError?: number; showWaterEffect?: boolean };
    postProcessStages?: { fxaa?: { enabled: boolean } };
  };
}

interface QualityTileset {
  maximumScreenSpaceError?: number;
  show?: boolean;
}

export function applyQualityLevel(
  viewer: QualityViewer,
  buildings: QualityTileset | null,
  index: number,
): void {
  const level = QUALITY_LEVELS[Math.min(Math.max(index, 0), QUALITY_LEVELS.length - 1)];
  viewer.resolutionScale = level.resolutionScale;
  const { scene } = viewer;
  if (scene.globe) {
    scene.globe.maximumScreenSpaceError = level.globeSse;
    scene.globe.showWaterEffect = level.waterEffect;
  }
  if (scene.msaaSamples !== undefined) scene.msaaSamples = level.msaaSamples;
  const fxaa = scene.postProcessStages?.fxaa;
  if (fxaa) fxaa.enabled = level.msaaSamples === 1;
  if (buildings) {
    buildings.maximumScreenSpaceError = level.buildingsSse;
    buildings.show = level.buildingsVisible;
  }
}
