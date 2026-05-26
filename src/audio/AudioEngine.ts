import { clampAudioUnit } from './audioMapping';

export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  engineBus: GainNode;
  cockpitBus: GainNode;
  private _started = false;

  constructor() {
    this.ctx = new AudioContext();
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
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this._started = true;
  }

  get started() { return this._started; }

  setMasterVolume(v: number) {
    this.master.gain.value = clampAudioUnit(v);
  }

  dispose() {
    this.ctx.close();
  }
}

let instance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!instance) instance = new AudioEngine();
  return instance;
}
