import { getAudioEngine, type AudioEngine } from './AudioEngine';
import { mapEngineN1ToSoundParams } from './audioMapping';

export class EngineSound {
  private osc: OscillatorNode;
  private gain: GainNode;
  private disposed = false;

  constructor(_index: number, engine: AudioEngine = getAudioEngine()) {
    const ctx = engine.ctx;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 60;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    this.osc.connect(this.gain);
    this.gain.connect(engine.engineBus);
    this.osc.start();
  }

  update(n1: number) {
    if (this.disposed) return;
    const params = mapEngineN1ToSoundParams(n1);
    this.osc.frequency.value = params.frequencyHz;
    this.gain.gain.value = params.gain;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.osc.stop();
    this.osc.disconnect();
    this.gain.disconnect();
  }
}
