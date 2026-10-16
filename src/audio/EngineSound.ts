import { getAudioEngine, type AudioEngine } from './AudioEngine';
import { createWhiteNoiseBuffer } from './noiseBuffer';

// Master's paused-silence window is ~160 ms; tau = 10 ms decays to well below
// its 0.0001 peak floor while still smoothing N1 and filter movement.
const SMOOTHING_TIME_CONSTANT = 0.01;

// Per-engine layer peak sum is capped at 0.12 so two engines through the 0.8
// engine bus stay inside the PCM oracle headroom (peak < 0.24 at master = 1).

export class EngineSound {
  private ctx: AudioContext;
  private noiseSource: AudioBufferSourceNode;
  private rumbleFilter: BiquadFilterNode;
  private rumbleGain: GainNode;
  private roarFilter: BiquadFilterNode;
  private roarGain: GainNode;
  private whineOscs: [OscillatorNode, OscillatorNode];
  private whineFilter: BiquadFilterNode;
  private whineGain: GainNode;
  private coreOsc: OscillatorNode;
  private coreFilter: BiquadFilterNode;
  private coreGain: GainNode;
  private disposed = false;

  constructor(_index: number, engine: AudioEngine = getAudioEngine()) {
    const ctx = engine.ctx;
    this.ctx = ctx;
    const noise = createWhiteNoiseBuffer(ctx, 2);

    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = noise;
    this.noiseSource.loop = true;

    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 60;
    this.rumbleFilter.Q.value = 0.7;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;

    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'bandpass';
    this.roarFilter.frequency.value = 350;
    this.roarFilter.Q.value = 0.9;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;

    this.whineOscs = [ctx.createOscillator(), ctx.createOscillator()];
    this.whineOscs[0].type = 'triangle';
    this.whineOscs[0].frequency.value = 500;
    this.whineOscs[1].type = 'triangle';
    this.whineOscs[1].frequency.value = 506;
    this.whineFilter = ctx.createBiquadFilter();
    this.whineFilter.type = 'lowpass';
    this.whineFilter.frequency.value = 1200;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;

    this.coreOsc = ctx.createOscillator();
    this.coreOsc.type = 'sine';
    this.coreOsc.frequency.value = 22;
    this.coreFilter = ctx.createBiquadFilter();
    this.coreFilter.type = 'lowpass';
    this.coreFilter.frequency.value = 90;
    this.coreGain = ctx.createGain();
    this.coreGain.gain.value = 0;

    this.noiseSource.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleGain);
    this.noiseSource.connect(this.roarFilter);
    this.roarFilter.connect(this.roarGain);
    this.whineOscs[0].connect(this.whineFilter);
    this.whineOscs[1].connect(this.whineFilter);
    this.whineFilter.connect(this.whineGain);
    this.coreOsc.connect(this.coreFilter);
    this.coreFilter.connect(this.coreGain);
    this.rumbleGain.connect(engine.engineBus);
    this.roarGain.connect(engine.engineBus);
    this.whineGain.connect(engine.engineBus);
    this.coreGain.connect(engine.engineBus);

    const now = ctx.currentTime;
    this.noiseSource.start(now);
    this.whineOscs[0].start(now);
    this.whineOscs[1].start(now);
    this.coreOsc.start(now);
  }

  update(n1: number) {
    if (this.disposed) return;
    const x = Number.isFinite(n1) ? Math.max(0, Math.min(1, n1 / 100)) : 0;
    const t = this.ctx.currentTime;
    const set = (param: AudioParam, value: number) => param.setTargetAtTime(value, t, SMOOTHING_TIME_CONSTANT);

    set(this.rumbleGain.gain, 0.04 * x);
    set(this.rumbleFilter.frequency, 60 + 120 * x * x);
    set(this.roarGain.gain, 0.032 * x * x);
    set(this.roarFilter.frequency, 350 + 2400 * x * x);
    set(this.whineGain.gain, 0.012 * Math.pow(x, 1.5));
    set(this.whineOscs[0].frequency, 500 + 2600 * x);
    set(this.whineOscs[1].frequency, 506 + 2600 * x);
    set(this.whineFilter.frequency, 1200 + 2400 * x);
    set(this.coreGain.gain, 0.036 * x);
    set(this.coreOsc.frequency, 22 + 58 * x);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const stop = (node: AudioScheduledSourceNode) => {
      try { node.stop(); } catch { /* source already stopped by the context */ }
      node.disconnect();
    };
    stop(this.noiseSource);
    stop(this.whineOscs[0]);
    stop(this.whineOscs[1]);
    stop(this.coreOsc);
    this.rumbleFilter.disconnect();
    this.rumbleGain.disconnect();
    this.roarFilter.disconnect();
    this.roarGain.disconnect();
    this.whineFilter.disconnect();
    this.whineGain.disconnect();
    this.coreFilter.disconnect();
    this.coreGain.disconnect();
  }
}
