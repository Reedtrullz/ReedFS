import { getAudioEngine } from './AudioEngine';
import { mapEngineN1ToSoundParams } from './audioMapping';

export class EngineSound {
  private fanOsc: OscillatorNode;
  private coreOsc: OscillatorNode;
  private fanGain: GainNode;
  private coreGain: GainNode;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private index: number;

  constructor(index: number) {
    this.index = index;
    const engine = getAudioEngine();
    const ctx = engine.ctx;
    this.fanOsc = ctx.createOscillator();
    this.fanOsc.type = 'sawtooth';
    this.fanOsc.frequency.value = 90;

    this.coreOsc = ctx.createOscillator();
    this.coreOsc.type = 'triangle';
    this.coreOsc.frequency.value = 240;

    this.fanGain = ctx.createGain();
    this.fanGain.gain.value = 0;
    this.coreGain = ctx.createGain();
    this.coreGain.gain.value = 0;

    this.fanOsc.connect(this.fanGain);
    this.coreOsc.connect(this.coreGain);
    this.fanGain.connect(engine.engineBus);
    this.coreGain.connect(engine.engineBus);

    this.createAirflowNoise(ctx, engine.engineBus);

    this.fanOsc.start();
    this.coreOsc.start();
  }

  private createAirflowNoise(ctx: AudioContext, destination: AudioNode): void {
    if (typeof ctx.createBufferSource !== 'function' || typeof ctx.createBuffer !== 'function' || typeof ctx.createBiquadFilter !== 'function') {
      return;
    }

    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 1));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 900 + this.index * 120;
    this.noiseFilter.Q.value = 0.7;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;

    this.noiseSource.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(destination);
    this.noiseSource.start();
  }

  update(n1: number) {
    const params = mapEngineN1ToSoundParams(n1);
    this.fanOsc.frequency.value = params.fanFrequencyHz;
    this.coreOsc.frequency.value = params.coreFrequencyHz + this.index * 7;
    this.fanGain.gain.value = params.fanGain;
    this.coreGain.gain.value = params.coreGain;
    if (this.noiseGain) this.noiseGain.gain.value = params.noiseGain;
  }

  dispose() {
    this.fanOsc.stop();
    this.coreOsc.stop();
    this.noiseSource?.stop();
    this.fanGain.disconnect();
    this.coreGain.disconnect();
    this.noiseGain?.disconnect();
    this.noiseFilter?.disconnect();
  }
}
