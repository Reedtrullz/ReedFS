import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Native renderer lifecycle integration, seeded approach; separate from full-flight proof.
async function waitForNativeScene(page: Page, surface: 'three' | 'cockpit' = 'three') {
  // Cesium readiness precedes the lazy aircraft layer. Bound that startup phase
  // separately before asserting ownership or deliberately losing a context.
  await page.waitForFunction((owner) =>
    document.querySelector('[data-testid="cesium-viewport"]')?.getAttribute('data-rfs-ready') === 'true'
    && document.querySelector('[data-rfs-surface="cesium"]') !== null
    && document.querySelector(`[data-rfs-surface="${owner}"]`) !== null,
  surface, { timeout: 30_000 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function session(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path);
    const s = useSimStore.getState();
    return { status: s.status, aircraft: s.aircraft, time: s.simulationTimeSeconds, route: s.flightPlan,
      input: s.input, ap: s.apState, generation: s.asyncPhysicsGeneration, save: localStorage.getItem('rfs.scenarioSnapshot.v1') };
  });
}

test('native Cesium and Three context loss preserves approach and bounded renderer ownership', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    const seen = new WeakSet<object>();
    const entries: Array<{ canvas: HTMLCanvasElement; gl: WebGLRenderingContext | WebGL2RenderingContext; resources: Set<unknown>[]; draws: number }> = [];
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const result = Reflect.apply(getContext, this, args);
      if ((args[0] === 'webgl' || args[0] === 'webgl2') && result && !seen.has(result)) {
        seen.add(result); const resources: Set<unknown>[] = [];
        for (const kind of ['Buffer', 'Texture', 'Program', 'Framebuffer', 'Renderbuffer']) {
          const owned = new Set<unknown>(); resources.push(owned);
          const create = Reflect.get(result, `create${kind}`); const remove = Reflect.get(result, `delete${kind}`);
          Reflect.set(result, `create${kind}`, (...values: unknown[]) => {
            const handle = Reflect.apply(create, result, values); if (handle) owned.add(handle); return handle;
          });
          Reflect.set(result, `delete${kind}`, (...values: unknown[]) => {
            owned.delete(values[0]); return Reflect.apply(remove, result, values);
          });
        }
        this.addEventListener('webglcontextlost', () => resources.forEach((owned) => owned.clear()));
        const entry = { canvas: this, gl: result, resources, draws: 0 }; entries.push(entry);
        for (const method of ['drawArrays', 'drawElements']) {
          const draw = Reflect.get(result, method);
          Reflect.set(result, method, (...values: unknown[]) => { entry.draws++; return Reflect.apply(draw, result, values); });
        }
      }
      return result;
    } as typeof getContext;
    Reflect.set(window, '__gpuOwnership', () => entries.map(({ canvas, gl, resources, draws }) => ({
      surface: canvas.dataset.rfsSurface ?? 'unknown', attached: canvas.isConnected, lost: gl.isContextLost(),
      handles: resources.reduce((n, owned) => n + owned.size, 0), draws,
    })));
  });
  // Controlled cold lazy-module delivery, before renderer fault injection.
  await page.route('**/src/viewport/ThreeLayer.tsx', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.continue();
  });
  await page.goto('/');
  await waitForNativeScene(page);
  await expect(page.locator('[data-rfs-surface="three"]')).toHaveCount(1);
  await page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const scenariosPath = '/src/sim/scenarios.ts'; const plansPath = '/src/sim/flightPlanLoader.ts';
    const { useSimStore } = await import(/* @vite-ignore */ path); const { scenarioById } = await import(/* @vite-ignore */ scenariosPath);
    const { createDefaultFlightForScenario } = await import(/* @vite-ignore */ plansPath);
    useSimStore.getState().setScenario('kpdx-10r-short-final');
    useSimStore.getState().setFlightPlan(createDefaultFlightForScenario(scenarioById('ksea-tutorial')));
    useSimStore.getState().start(); useSimStore.getState().pause();
    await useSimStore.getState().saveScenarioState(undefined, { slotId: 'gpu-proof', name: 'Preserved approach' });
    useSimStore.getState().resume();
  });
  await expect.poll(async () => (await session(page)).time).toBeGreaterThan(0);
  const approach = await session(page); expect(approach.aircraft.ground.weightOnWheels).toBe(false); expect(approach.route).not.toBeNull(); expect(approach.save).not.toBeNull();
  const samples = [];
  for (const surface of ['cesium', 'three', 'cockpit']) {
    if (surface === 'cockpit') await page.keyboard.press('c');
    await expect(page.locator(`[data-rfs-surface="${surface}"]`)).toHaveCount(1);
    const cycle = await session(page);
    const contextCount = await page.evaluate(() => Reflect.get(window, '__gpuOwnership')().length);
    await page.evaluate((owner) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-rfs-surface="${owner}"]`)!;
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const loss = gl?.getExtension('WEBGL_lose_context'); if (!loss) throw new Error('Native loss extension unavailable');
      Reflect.set(window, '__restoreLostSurface', () => loss.restoreContext()); loss.loseContext();
    }, surface);
    await expect(page.getByText('GRAPHICS UNAVAILABLE', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Primary flight display', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, '__gpuOwnership')().length)).toBe(contextCount);
    const lost = await session(page); expect(lost.status).toBe('running'); expect(lost.time).toBeGreaterThan(cycle.time);
    expect(lost.route).toEqual(approach.route); expect(lost.save).toBe(approach.save); expect(lost.generation).toBe(cycle.generation);
    await page.evaluate(() => Reflect.get(window, '__restoreLostSurface')());
    // Library restoration alone is not claimed to restore a valid frame; fallback remains explicit.
    await expect(page.getByText('GRAPHICS UNAVAILABLE', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'PAUSE', exact: true }).click();
    await expect.poll(async () => (await session(page)).status).toBe('paused');
    const before = await session(page);
    await page.getByRole('button', { name: 'RESTORE 3D VIEW', exact: true }).click();
    await waitForNativeScene(page, surface === 'cockpit' ? 'cockpit' : 'three');
    await expect(page.locator('[data-rfs-surface="cesium"]')).toHaveCount(1);
    await expect(page.locator(`[data-rfs-surface="${surface === 'cockpit' ? 'cockpit' : 'three'}"]`)).toHaveCount(1);
    await expect(page.getByText('GRAPHICS UNAVAILABLE', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('PFD observation state', { exact: true })).toContainText('PAUSED');
    expect(await session(page)).toEqual(before);
    await expect.poll(() => page.evaluate(() => Reflect.get(window, '__gpuOwnership')().filter((entry: { attached: boolean; draws: number }) => entry.attached && entry.draws > 0).length)).toBe(2);
    const ownership = await page.evaluate(() => Reflect.get(window, '__gpuOwnership')()) as Array<{ surface: string; attached: boolean; lost: boolean; handles: number }>;
    const live = ownership.filter((entry) => entry.attached); expect(live).toHaveLength(2); expect(live.every((entry) => !entry.lost)).toBe(true);
    expect(ownership.filter((entry) => !entry.attached).every((entry) => entry.lost && entry.handles === 0)).toBe(true);
    samples.push({ surface, time: before.time, ownership });
    await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  }
  const receipt = testInfo.outputPath('native-gpu-recovery.json');
  await writeFile(receipt, JSON.stringify({ scope: 'Three bounded seeded-approach context-loss cycles; native handle ownership, not driver RAM or full flight', samples }, null, 2));
  await testInfo.attach('native-gpu-recovery', { path: receipt, contentType: 'application/json' });
});

test('unavailable native WebGL leaves flight controls alive and permits explicit recovery', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(window, '__denyGraphics', true); const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      if (Reflect.get(window, '__denyGraphics') && (args[0] === 'webgl' || args[0] === 'webgl2')) return null;
      return Reflect.apply(original, this, args);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.getByText('Cesium scene failed to initialize.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'START ROLL', exact: true }).click();
  await expect.poll(async () => (await session(page)).time).toBeGreaterThan(0);
  await expect(page.getByLabel('Primary flight display', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click(); const before = await session(page);
  await page.evaluate(() => Reflect.set(window, '__denyGraphics', false));
  await page.getByRole('button', { name: 'RETRY SCENERY', exact: true }).click();
  await waitForNativeScene(page);
  await expect(page.locator('[data-rfs-surface="cesium"]')).toHaveCount(1);
  await expect(page.locator('[data-rfs-surface="three"]')).toHaveCount(1);
  expect(await session(page)).toEqual(before);
});
