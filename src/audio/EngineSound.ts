import { getAudioEngine } from './AudioEngine';
import { mapEngineN1ToSoundParams } from './audioMapping';

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
    const params = mapEngineN1ToSoundParams(n1);
    this.osc.frequency.value = params.frequencyHz;
    this.gain.gain.value = params.gain;
  }

  dispose() {
    this.osc.stop();
    this.gain.disconnect();
  }
}
