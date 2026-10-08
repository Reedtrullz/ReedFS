import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('native engine PCM detects silent, clipped and discontinuous sources', async ({ page }, testInfo) => {
  await page.goto('/e2e/fixtures/runtime.html');
  const evidence = await page.evaluate(async () => {
    const enginePath = '/src/audio/AudioEngine.ts'; const soundPath = '/src/audio/EngineSound.ts'; const oraclePath = '/e2e/helpers/audioPcm.ts';
    const { AudioEngine } = await import(/* @vite-ignore */ enginePath);
    const { EngineSound } = await import(/* @vite-ignore */ soundPath);
    const { qualifyEnginePcm } = await import(/* @vite-ignore */ oraclePath);
    const render = async (n1: number, fault: string | null = null) => {
      const ctx = new OfflineAudioContext(1, 12000, 48000);
      const engine = new AudioEngine({ contextFactory: () => ctx }); engine.setMasterVolume(1);
      const sounds = [new EngineSound(0, engine), new EngineSound(1, engine)];
      sounds.forEach((sound) => sound.update(n1));
      let discontinuous: ConstantSourceNode | null = null;
      if (fault === 'silent') engine.engineBus.gain.value = 0;
      if (fault === 'clipped') engine.engineBus.gain.value = 20;
      if (fault === 'discontinuous') {
        engine.engineBus.gain.value = 0;
        discontinuous = ctx.createConstantSource(); discontinuous.offset.value = -0.18;
        discontinuous.offset.setValueAtTime(0.18, 0.125); discontinuous.connect(engine.master); discontinuous.start();
      }
      try {
        const buffer = await ctx.startRendering(); const samples = buffer.getChannelData(0);
        return { n1, fault, ...qualifyEnginePcm(samples, buffer.sampleRate) };
      } finally {
        sounds.forEach((sound) => sound.dispose()); discontinuous?.disconnect(); await engine.dispose();
      }
    };
    const healthy = []; for (const n1 of [20, 40, 60, 80, 100]) healthy.push(await render(n1));
    const faults = []; for (const fault of ['silent', 'clipped', 'discontinuous']) faults.push(await render(100, fault));
    return { healthy, faults, userAgent: navigator.userAgent };
  });
  for (const row of evidence.healthy) {
    expect(row.failures).toEqual([]); expect(row.durationSeconds).toBe(0.25);
    expect(row.rms).toBeGreaterThan(0.002); expect(row.peak).toBeLessThan(0.24);
  }
  for (let i = 1; i < evidence.healthy.length; i++) expect(evidence.healthy[i].rms).toBeGreaterThan(evidence.healthy[i - 1].rms);
  expect(evidence.faults.find((row) => row.fault === 'silent')?.failures).toContain('unexpected-silence');
  expect(evidence.faults.find((row) => row.fault === 'clipped')?.failures).toContain('headroom');
  const jump = evidence.faults.find((row) => row.fault === 'discontinuous')!;
  expect(jump.peak).toBeLessThan(0.24); expect(jump.failures).toEqual(['discontinuity']);
  await testInfo.attach('native-engine-pcm-qualification', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  await writeFile(testInfo.outputPath('native-engine-pcm-qualification.json'), JSON.stringify(evidence, null, 2) + '\n');
});
