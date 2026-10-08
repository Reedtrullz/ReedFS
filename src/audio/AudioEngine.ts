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
  private _failure: string | null = null;
  private _starting: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private notify = () => { for (const listener of this.listeners) listener(); };

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
    this.ctx.addEventListener?.('statechange', this.notify);
  }

  async start(): Promise<void> {
    if (this._disposed) throw new Error('Cannot start a disposed AudioEngine');
    if (this._starting) return this._starting;
    const request = this.resumeContext();
    this._starting = request;
    try { await request; }
    finally { if (this._starting === request) this._starting = null; }
  }

  private async resumeContext(): Promise<void> {
    this._failure = null;
    try {
      if (this.ctx.state === 'closed') throw new Error('Audio context is closed');
      if (this.ctx.state !== 'running') await this.ctx.resume();
      if (this._disposed || this.ctx.state !== 'running') throw new Error('Audio context did not become running');
      this._started = true;
    } catch (error) {
      this._failure = error instanceof Error ? error.message : 'Audio start failed';
      throw error;
    } finally { this.notify(); }
  }

  get sessionState(): 'locked' | 'running' | 'suspended' | 'failed' | 'closed' {
    if (this._disposed || this.ctx.state === 'closed') return 'closed';
    if (this._failure) return 'failed';
    if (!this._started) return 'locked';
    return this.ctx.state === 'running' ? 'running' : 'suspended';
  }

  subscribeStatus(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
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
    this.engineBus.disconnect(); this.cockpitBus.disconnect(); this.master.disconnect();
    this.ctx.removeEventListener?.('statechange', this.notify);
    this.notify(); this.listeners.clear();
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
