import { getAudioEngine } from './AudioEngine';

export class EngineSound {
  private osc: OscillatorNode;
  private gain: GainNode;
  private index: number;

  constructor(index: number) {
    this.index = index;
    const ctx = getAudioEngine().ctx;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 60;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    this.osc.connect(this.gain);
    this.gain.connect(getAudioEngine().engineBus);
    this.osc.start();
  }

  update(n1: number) {
    // N1 0-100% → frequency 40-180Hz
    this.osc.frequency.value = 40 + n1 * 1.4;
    // N1 0-100% → gain 0-0.12
    this.gain.gain.value = (n1 / 100) * 0.12;
  }

  dispose() {
    this.osc.stop();
    this.gain.disconnect();
  }
}
