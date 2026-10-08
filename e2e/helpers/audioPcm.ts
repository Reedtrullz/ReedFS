/** Current two-engine qualification profile, distinct from listening acceptance. */
export function qualifyEnginePcm(samples: ArrayLike<number>, sampleRate: number) {
  let peak = 0; let jump = 0; let sum = 0; let finite = true;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i]; finite &&= Number.isFinite(value);
    peak = Math.max(peak, Math.abs(value)); sum += value * value;
    if (i > 0) jump = Math.max(jump, Math.abs(value - samples[i - 1]));
  }
  const rms = Math.sqrt(sum / samples.length);
  const failures = [];
  if (!finite || samples.length !== 12000 || sampleRate !== 48000) failures.push('invalid-duration-or-data');
  if (rms < 0.002) failures.push('unexpected-silence');
  if (peak > 0.24) failures.push('headroom');
  if (jump > 0.24) failures.push('discontinuity');
  return { peak, rms, maxSampleJump: jump, samples: samples.length, durationSeconds: samples.length / sampleRate, failures };
}
