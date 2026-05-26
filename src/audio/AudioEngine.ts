import { clampAudioUnit } from './audioMapping';

export interface AudioEngineOptions {
  contextFactory?: () => AudioContext;
}

export interface AudioEngineStatus {
  started: boolean;
  disposed: boolean;
  contextState: AudioContextState;
}

function createBrowserAudioContext(): AudioContext {
  return new AudioContext();
}

export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  engineBus: GainNode;
  cockpitBus: GainNode;
  private _started = false;
  private _disposed = false;

  constructor(options: AudioEngineOptions = {}) {
    this.ctx = (options.contextFactory ?? createBrowserAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    this.engineBus = this.ctx.createGain();
    this.engineBus.gain.value = 0.8;
    this.engineBus.connect(this.master);

    this.cockpitBus = this.ctx.createGain();
    this.cockpitBus.gain.value = 0.6;
    this.cockpitBus.connect(this.master);

    this._started = false;
  }

  async start() {
    if (this._disposed) throw new Error('Cannot start a disposed AudioEngine');
    if (this._started) return;
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this._started = true;
  }

  get started() { return this._started; }

  get disposed() { return this._disposed; }

  get status(): AudioEngineStatus {
    return {
      started: this._started,
      disposed: this._disposed,
      contextState: this.ctx.state,
    };
  }

  setMasterVolume(v: number) {
    this.master.gain.value = clampAudioUnit(v);
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    this._started = false;
    if (this.ctx.state !== 'closed') {
      await this.ctx.close();
    }
    if (instance === this) instance = null;
  }
}

let instance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!instance) instance = new AudioEngine();
  return instance;
}
