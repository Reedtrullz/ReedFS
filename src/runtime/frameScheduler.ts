export const DEFAULT_FRAME_DT_SECONDS = 1 / 60;
export const MAX_FRAME_DT_SECONDS = 0.05;

export interface FramePhaseContext {
  readonly timestamp: number;
  readonly dt: number;
}

export type FramePhase = (context: FramePhaseContext) => void;

export interface FrameSchedulerPhases {
  readonly input?: FramePhase;
  readonly fixedSimulation?: FramePhase;
  readonly renderEffects?: FramePhase;
  readonly audio?: FramePhase;
}

export interface FrameSchedulerClock {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
}

function defaultClock(): FrameSchedulerClock {
  return {
    requestAnimationFrame: (callback) => requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => cancelAnimationFrame(handle),
  };
}

export function frameDeltaSeconds(timestamp: number, previousTimestamp: number): number {
  if (previousTimestamp <= 0) return DEFAULT_FRAME_DT_SECONDS;
  return Math.min(Math.max(0, (timestamp - previousTimestamp) / 1000), MAX_FRAME_DT_SECONDS);
}

export class FrameScheduler {
  #phases: FrameSchedulerPhases;
  readonly #clock: FrameSchedulerClock;
  #rafHandle: number | null = null;
  #lastTimestamp = 0;
  #started = false;

  constructor(phases: FrameSchedulerPhases, clock: FrameSchedulerClock = defaultClock()) {
    this.#phases = phases;
    this.#clock = clock;
  }

  setPhases(phases: FrameSchedulerPhases): void {
    this.#phases = phases;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#rafHandle = this.#clock.requestAnimationFrame(this.#loop);
  }

  stop(): void {
    this.#started = false;
    if (this.#rafHandle !== null) {
      this.#clock.cancelAnimationFrame(this.#rafHandle);
      this.#rafHandle = null;
    }
    this.#lastTimestamp = 0;
  }

  runFrame(timestamp: number): void {
    const context: FramePhaseContext = {
      timestamp,
      dt: frameDeltaSeconds(timestamp, this.#lastTimestamp),
    };
    this.#lastTimestamp = timestamp;

    this.#phases.input?.(context);
    this.#phases.fixedSimulation?.(context);
    this.#phases.renderEffects?.(context);
    this.#phases.audio?.(context);
  }

  readonly #loop = (timestamp: number): void => {
    this.#rafHandle = null;
    this.runFrame(timestamp);
    if (this.#started) {
      this.#rafHandle = this.#clock.requestAnimationFrame(this.#loop);
    }
  };
}
