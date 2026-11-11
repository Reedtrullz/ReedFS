import { getAudioEngine, type AudioEngine } from './AudioEngine';
import { createWhiteNoiseBuffer } from './noiseBuffer';

const SMOOTHING_TIME_CONSTANT = 0.01;

interface AmbientSoundInput {
  iasKnots: number;
  groundSpeedKnots: number;
  onGround: boolean;
  brake: number;
  flapSetting: number;
  flapTarget: number;
  gearPosition: number;
  gearTarget: number;
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function clampPositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export class AmbientSounds {
  private ctx: AudioContext;
  private environmentBus: GainNode;
  private mechanicalBus: GainNode;
  private noiseSource: AudioBufferSourceNode;
  private windFilter: BiquadFilterNode;
  private windGain: GainNode;
  private rollFilter: BiquadFilterNode;
  private rollGain: GainNode;
  private flapServo: OscillatorNode;
  private flapServoFilter: BiquadFilterNode;
  private flapServoGain: GainNode;
  private gearServo: OscillatorNode;
  private gearServoFilter: BiquadFilterNode;
  private gearServoGain: GainNode;
  private squeal: OscillatorNode;
  private squealFilter: BiquadFilterNode;
  private squealGain: GainNode;
  private disposed = false;

  constructor(engine: AudioEngine = getAudioEngine()) {
    const ctx = engine.ctx;
    this.ctx = ctx;
    this.environmentBus = engine.environmentBus;
    this.mechanicalBus = engine.mechanicalBus;
    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = createWhiteNoiseBuffer(ctx, 2);
    this.noiseSource.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 300;
    this.windFilter.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;

    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 90;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;

    this.flapServo = ctx.createOscillator();
    this.flapServo.type = 'square';
    this.flapServo.frequency.value = 42;
    this.flapServoFilter = ctx.createBiquadFilter();
    this.flapServoFilter.type = 'bandpass';
    this.flapServoFilter.frequency.value = 320;
    this.flapServoFilter.Q.value = 6;
    this.flapServoGain = ctx.createGain();
    this.flapServoGain.gain.value = 0;

    this.gearServo = ctx.createOscillator();
    this.gearServo.type = 'square';
    this.gearServo.frequency.value = 33;
    this.gearServoFilter = ctx.createBiquadFilter();
    this.gearServoFilter.type = 'bandpass';
    this.gearServoFilter.frequency.value = 250;
    this.gearServoFilter.Q.value = 6;
    this.gearServoGain = ctx.createGain();
    this.gearServoGain.gain.value = 0;

    this.squeal = ctx.createOscillator();
    this.squeal.type = 'sawtooth';
    this.squeal.frequency.value = 1400;
    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 1800;
    this.squealFilter.Q.value = 4;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;

    this.noiseSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.environmentBus);
    this.noiseSource.connect(this.rollFilter);
    this.rollFilter.connect(this.rollGain);
    this.rollGain.connect(this.mechanicalBus);
    this.flapServo.connect(this.flapServoFilter);
    this.flapServoFilter.connect(this.flapServoGain);
    this.flapServoGain.connect(this.mechanicalBus);
    this.gearServo.connect(this.gearServoFilter);
    this.gearServoFilter.connect(this.gearServoGain);
    this.gearServoGain.connect(this.mechanicalBus);
    this.squeal.connect(this.squealFilter);
    this.squealFilter.connect(this.squealGain);
    this.squealGain.connect(this.mechanicalBus);

    const now = ctx.currentTime;
    this.noiseSource.start(now);
    this.flapServo.start(now);
    this.gearServo.start(now);
    this.squeal.start(now);
  }

  update(input: AmbientSoundInput) {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    const set = (param: AudioParam, value: number) => param.setTargetAtTime(value, t, SMOOTHING_TIME_CONSTANT);
    const ias = clampPositive(input.iasKnots);
    const gs = clampPositive(input.groundSpeedKnots);
    const airborneWind = Math.min(1, ias / 140);
    const wind = input.onGround ? airborneWind * 0.4 : airborneWind;
    const roll = Math.min(1, gs / 45);

    set(this.windGain.gain, 0.035 * wind);
    set(this.windFilter.frequency, 300 + 1200 * airborneWind);
    set(this.rollGain.gain, input.onGround ? 0.05 * roll : 0);
    set(this.rollFilter.frequency, 90 + 240 * roll);
    set(this.squealGain.gain, input.onGround ? 0.012 * clampUnit(input.brake) * Math.min(1, gs / 8) : 0);
    set(this.flapServoGain.gain, Math.abs(input.flapTarget - input.flapSetting) > 0.5 ? 0.012 : 0);
    set(this.gearServoGain.gain, Math.abs(input.gearTarget - input.gearPosition) > 0.02 ? 0.012 : 0);
  }

  touchdown(sinkRateMps: number) {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    const intensity = Math.min(1, 0.25 + Math.max(0, sinkRateMps) / 3);
    this.playThump(t, intensity);
    this.playNoiseBurst(this.mechanicalBus, t, 900, 2, 0.05 * intensity, 1.4);
  }

  silence() {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    for (const gain of [this.windGain, this.rollGain, this.flapServoGain, this.gearServoGain, this.squealGain]) {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0, t, SMOOTHING_TIME_CONSTANT);
    }
  }

  private playThump(t: number, intensity: number) {
    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(160, t);
    thump.frequency.exponentialRampToValueAtTime(45, t + 0.28);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0.16 * intensity, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    thump.connect(thumpGain);
    thumpGain.connect(this.mechanicalBus);
    thump.start(t);
    thump.stop(t + 0.32);
    thump.onended = () => {
      thump.disconnect();
      thumpGain.disconnect();
    };
  }

  private playNoiseBurst(bus: GainNode, t: number, frequencyHz: number, q: number, peak: number, seconds: number) {
    const source = this.ctx.createBufferSource();
    source.buffer = createWhiteNoiseBuffer(this.ctx, Math.max(0.2, seconds));
    const filter = this.createBandpass(frequencyHz, q);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start(t);
    source.stop(t + seconds + 0.05);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private createBandpass(frequencyHz: number, q: number): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequencyHz;
    filter.Q.value = q;
    return filter;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const stop = (node: AudioScheduledSourceNode) => {
      try { node.stop(); } catch { /* source already stopped by the context */ }
      node.disconnect();
    };
    stop(this.noiseSource);
    stop(this.flapServo);
    stop(this.gearServo);
    stop(this.squeal);
    this.windFilter.disconnect();
    this.windGain.disconnect();
    this.rollFilter.disconnect();
    this.rollGain.disconnect();
    this.flapServoFilter.disconnect();
    this.flapServoGain.disconnect();
    this.gearServoFilter.disconnect();
    this.gearServoGain.disconnect();
    this.squealFilter.disconnect();
    this.squealGain.disconnect();
  }
}
