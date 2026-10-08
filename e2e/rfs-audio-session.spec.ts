import { expect, test, type Page } from '@playwright/test';

// Audio integration lane: native browser nodes and visible controls, with
// diagnostic state access distinct from blackbox/full-flight acceptance.
async function verifyAudioSession(page: Page) {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    const live = new Set<OscillatorNode>();
    let starts = 0; let stops = 0;
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext { constructor() { super(); contexts.push(this); } };
    const start = OscillatorNode.prototype.start;
    const stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.start = function(when) { starts++; live.add(this); return start.call(this, when); };
    OscillatorNode.prototype.stop = function(when) { stops++; live.delete(this); return stop.call(this, when); };
    Object.assign(window, { audioProbe: { contexts, counts: () => ({ starts, stops, live: live.size }) } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'AUDIO: OFF', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { audioProbe: { contexts: AudioContext[] } }).audioProbe.contexts.length)).toBe(0);
  await page.getByRole('button', { name: 'AUDIO: OFF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AUDIO: ON', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { audioProbe: { counts: () => { live: number } } }).audioProbe.counts().live)).toBe(2);
  await page.evaluate(async () => {
    const path = '/src/audio/AudioEngine.ts';
    const { getAudioEngine } = await import(/* @vite-ignore */ path);
    await getAudioEngine().ctx.suspend();
  });
  await expect(page.getByRole('button', { name: /AUDIO: SUSPENDED/ })).toBeVisible();
  await page.getByRole('button', { name: /AUDIO: SUSPENDED/ }).click();
  await expect(page.getByRole('button', { name: 'AUDIO: ON', exact: true })).toBeVisible();
  // Keep nonzero engine N1 in a paused state. Session policy must silence it.
  const levels = await page.evaluate(async () => {
    const storePath = '/src/store/simStore.ts';
    const enginePath = '/src/audio/AudioEngine.ts';
    const loopPath = '/src/audio/EngineSound.ts';
    const { useSimStore } = await import(/* @vite-ignore */ storePath);
    const { getAudioEngine } = await import(/* @vite-ignore */ enginePath);
    const { EngineSound } = await import(/* @vite-ignore */ loopPath);
    // Native AnalyserNode measures the product bus without replacing Web Audio.
    const engine = getAudioEngine(); const analyser = engine.ctx.createAnalyser();
    engine.engineBus.connect(analyser);
    const state = useSimStore.getState();
    useSimStore.setState({ aircraft: { ...state.aircraft, engines: state.aircraft.engines.map((e: { n1: number }) => ({ ...e, n1: 80 })) }, status: 'paused' });
    await new Promise((resolve) => setTimeout(resolve, 160));
    const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
    engine.engineBus.disconnect(analyser);
    const sound = new EngineSound(0, engine); sound.dispose(); sound.dispose();
    return { peak: Math.max(...samples.map(Math.abs)), context: engine.ctx.state };
  });
  expect(levels.context).toBe('running');
  expect(levels.peak).toBeLessThan(0.0001);
  await page.getByRole('button', { name: 'AUDIO: ON', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { audioProbe: { counts: () => { live: number } } }).audioProbe.counts().live)).toBe(0);
  await page.getByRole('button', { name: 'AUDIO: OFF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { audioProbe: { counts: () => { live: number } } }).audioProbe.counts().live)).toBe(2);
}

test('desktop native audio reflects suspension, silence on pause, and teardown', async ({ page }) => { await verifyAudioSession(page); });
test.describe('touch Chromium emulation (not physical mobile acceptance)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('audio gestures and lifecycle remain operable', async ({ page }) => { await verifyAudioSession(page); });
});

test('native offline mixer bounds overlapping engines and master zero silences them', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const enginePath = '/src/audio/AudioEngine.ts'; const soundPath = '/src/audio/EngineSound.ts';
    const { AudioEngine } = await import(/* @vite-ignore */ enginePath);
    const { EngineSound } = await import(/* @vite-ignore */ soundPath);
    const context = new OfflineAudioContext(1, 12000, 48000);
    const engine = new AudioEngine({ contextFactory: () => context });
    engine.setMasterVolume(1);
    const sounds = [new EngineSound(0, engine), new EngineSound(1, engine)];
    sounds.forEach((sound) => sound.update(100));
    engine.master.gain.setValueAtTime(0, 0.1);
    const buffer = await context.startRendering();
    const data = buffer.getChannelData(0);
    sounds.forEach((sound) => { sound.dispose(); sound.dispose(); });
    await engine.dispose();
    return { peak: Math.max(...data.slice(0, 4800).map(Math.abs)), silentPeak: Math.max(...data.slice(6000).map(Math.abs)) };
  });
  expect(result.peak).toBeGreaterThan(0.01);
  expect(result.peak).toBeLessThan(0.2);
  expect(result.silentPeak).toBe(0);
});

test('master zero and mute cancel speech while rejected delivery preserves captions', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string; volume: number }> = [];
    const probe = { calls, cancels: 0, reject: false };
    // Use native utterances with a controlled speech transport. Headless
    // delivery receipts are not acoustic or physical-device acceptance.
    speechSynthesis.speak = (utterance) => { calls.push({ text: utterance.text, volume: utterance.volume }); if (probe.reject) throw new Error('voice unavailable'); };
    speechSynthesis.cancel = () => { probe.cancels++; };
    Object.assign(window, { speechProbe: probe });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'AUDIO: OFF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AUDIO: ON', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Audio settings/ }).click();
  await page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path);
    const state = useSimStore.getState(); const a = state.aircraft;
    useSimStore.setState({ asyncPhysicsGeneration: state.asyncPhysicsGeneration + 1, asyncPhysicsInFlight: false, lastFrameTime: 0, status: 'running', aircraft: { ...a, position: { ...a.position, alt: a.ground.groundAltFt + 180 }, velocity: { u: 90, v: 0, w: 0 }, config: { ...a.config, gearDown: false }, ground: { ...a.ground, weightOnWheels: false, aglFt: 180 }, flightPhase: 'APPROACH' } });
  });
  const read = () => page.evaluate(() => (window as unknown as { speechProbe: { calls: Array<{ text: string; volume: number }>; cancels: number; reject: boolean } }).speechProbe);
  await expect.poll(async () => (await read()).calls.length).toBeGreaterThan(0);
  expect((await read()).calls[0].volume).toBeCloseTo(0.35);
  const slider = page.getByRole('slider', { name: 'Master volume', exact: true });
  await slider.focus(); await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await expect.poll(async () => (await read()).cancels).toBeGreaterThan(0);
  const zeroCalls = (await read()).calls.length;
  await page.waitForTimeout(180);
  expect((await read()).calls.length).toBe(zeroCalls);
  await slider.press('End'); await expect(slider).toHaveValue('1');
  await expect.poll(async () => (await read()).calls.length).toBeGreaterThan(zeroCalls);
  expect((await read()).calls.at(-1)?.volume).toBeCloseTo(0.7);
  const cancels = (await read()).cancels;
  await page.getByRole('checkbox', { name: 'Mute audio', exact: true }).check();
  await expect.poll(async () => (await read()).cancels).toBeGreaterThan(cancels);
  await page.evaluate(async () => {
    (window as unknown as { speechProbe: { reject: boolean } }).speechProbe.reject = true;
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path);
    const state = useSimStore.getState();
    useSimStore.setState({ asyncPhysicsGeneration: state.asyncPhysicsGeneration + 1, asyncPhysicsInFlight: false, lastFrameTime: 0, status: 'running', aircraft: { ...state.aircraft, position: { ...state.aircraft.position, alt: state.aircraft.ground.groundAltFt + 600 }, ground: { ...state.aircraft.ground, aglFt: 600, weightOnWheels: false }, attitude: { phi: 0, theta: 0, psi: 0 }, quaternion: { q0: 1, q1: 0, q2: 0, q3: 0 }, flightPhase: 'DESCENT', velocity: { u: 90, v: 0, w: 16 } } });
  });
  await page.getByRole('checkbox', { name: 'Mute audio', exact: true }).uncheck();
  await expect(page.getByRole('status', { name: 'Audio caption', exact: true })).toHaveText('PULL UP');
  await page.getByRole('button', { name: 'RESET', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Audio caption', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /Audio settings/ }).click();
  await expect(page.getByRole('slider', { name: 'Master volume', exact: true })).toHaveValue('1');
  await expect(page.getByRole('checkbox', { name: 'Mute audio', exact: true })).not.toBeChecked();
});

test('initial enabled StrictMode remount has exactly two live native oscillators', async ({ page }) => {
  await page.addInitScript(() => {
    const live = new Set<OscillatorNode>(); let starts = 0; let stops = 0;
    const start = OscillatorNode.prototype.start; const stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.start = function(when) { starts++; live.add(this); return start.call(this, when); };
    OscillatorNode.prototype.stop = function(when) { stops++; live.delete(this); return stop.call(this, when); };
    Object.assign(window, { strictAudioCounts: () => ({ live: live.size, starts, stops }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'AUDIO: OFF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AUDIO: ON', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AUDIO: ON', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { strictAudioCounts: () => { live: number } }).strictAudioCounts().live)).toBe(0);
  const result = await page.evaluate(async () => {
    const path = '/e2e/fixtures/audio-lifecycle.tsx'; const { mountStrictAudioProbe } = await import(/* @vite-ignore */ path);
    const counts = (window as unknown as { strictAudioCounts: () => { live: number; starts: number; stops: number } }).strictAudioCounts;
    const before = counts(); const dispose = await mountStrictAudioProbe(); const mounted = counts();
    dispose(); const after = counts();
    return { before, mounted, after };
  });
  expect(result.mounted.live).toBe(2);
  expect(result.mounted.starts - result.before.starts).toBe(4);
  expect(result.mounted.stops - result.before.stops).toBe(2);
  expect(result.after.live).toBe(0);
  expect(result.after.stops - result.before.stops).toBe(4);
});
