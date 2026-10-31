// ReedFS O19/U16 native controls. Runs INSIDE the namespace guard (see reedfs-native-linux.py), one cohort per
// invocation: node reedfs-native-controls.mjs <desktop|narrow>-<worker|main>. Emits NDJSON on stdout. Every control
// drives the real dev-served app and real Chromium; no property patching of results, no dispatched substitute events.
import fs from 'node:fs';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { URL, pathToFileURL } from 'node:url';

export const ORIGIN = 'http://127.0.0.1:5197';
export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, narrow: { width: 390, height: 844 } };
export const COHORTS = ['desktop-worker', 'desktop-main', 'narrow-worker', 'narrow-main'];
const BASE = ['scene-fidelity', 'layout', 'camera', 'start-roll', 'keyboard', 'pause', 'reset', 'no-unexpected-pageerrors'];
export const PROTOCOL_SCENARIOS = ['native-worker/main-six-command-physical-control-route-observation-parity', 'native-payload-out-of-order-duplicate-late-delivery',
  'cohort', 'nonfinite', 'timeout-snapshot', 'dispose', 'actual-native-worker-crash', 'actual-worker-nonfinite-execution', 'held-trim-during-real-worker', 'source-hidden-gap-catchup-component'];
export const WIDGET_QUALITY = { targetFrameRate: 60, resolutionScale: 1, msaaSamples: 2, globeSse: 3, waterEffect: true };
export const screenshotNames = (cohort) => ['layout-' + cohort, 'final-' + cohort];

export function cohortControls(cohort) {
  if (!COHORTS.includes(cohort)) throw new Error('unknown cohort ' + cohort);
  const [vp, mode] = cohort.split('-');
  const keys = BASE.map((k) => cohort + ':' + k);
  if (vp === 'desktop') keys.push(cohort + ':tab-hidden-resume');
  if (mode === 'worker') keys.push(cohort + ':stale-fence-spec');
  if (cohort === 'desktop-worker') keys.push(cohort + ':worker-error', cohort + ':worker-messageerror', ...PROTOCOL_SCENARIOS.map((s) => cohort + ':protocol:' + s));
  return keys;
}
export const requiredControls = () => COHORTS.flatMap(cohortControls);

// Prerequisite selector: only the two lifecycle rows of desktop-worker, run alone. Never a substitute for the full matrix.
export const LIFECYCLE_COHORT = 'desktop-worker';
export const LIFECYCLE_CONTROLS = ['tab-hidden-resume', 'worker-messageerror'];
export const lifecycleKeys = () => LIFECYCLE_CONTROLS.map((c) => LIFECYCLE_COHORT + ':' + c);
export function parseSelector(argv) {
  const [cohort, sel, ...extra] = argv;
  cohortControls(cohort);
  if (extra.length || (sel !== undefined && (sel !== 'lifecycle' || cohort !== LIFECYCLE_COHORT))) throw new Error('invalid selector ' + JSON.stringify(argv));
  return { cohort, lifecycle: sel === 'lifecycle' };
}

export function buildMatrix(records, keys = requiredControls()) {
  const by = new Map(records.map((r) => [r.key, r]));
  const rows = keys.map((key) => {
    const r = by.get(key);
    return r ? { key, status: r.status, evidence: r.evidence ?? null, reason: r.reason ?? null }
      : { key, status: 'MISSING', evidence: null, reason: 'control emitted no record' };
  });
  const has = (s) => rows.some((r) => r.status === s);
  return { status: has('FAIL') ? 'FAIL' : (has('BLOCKED') || has('MISSING')) ? 'BLOCKED' : 'PASS', rows };
}

// Strict trust-boundary check of a matrix emitted by an untrusted child: exact unique expected rows, known statuses,
// PASS rows need evidence, others need a reason, and the overall status must follow from the rows.
export function validateMatrix(matrix, keys) {
  const p = [];
  if (!matrix || !Array.isArray(matrix.rows)) return ['matrix missing or rows not an array'];
  const seen = new Set();
  for (const r of matrix.rows) {
    if (!r || typeof r.key !== 'string' || !keys.includes(r.key)) { p.push('unknown row ' + JSON.stringify(r?.key)); continue; }
    if (seen.has(r.key)) p.push('duplicate row ' + r.key);
    seen.add(r.key);
    if (!['PASS', 'FAIL', 'BLOCKED', 'MISSING'].includes(r.status)) p.push('bad status ' + r.key);
    else if (r.status === 'PASS' && (r.evidence === null || r.evidence === undefined || typeof r.evidence !== 'object')) p.push('PASS without evidence ' + r.key);
    else if (r.status !== 'PASS' && !r.reason) p.push('non-PASS without reason ' + r.key);
  }
  for (const k of keys) if (!seen.has(k)) p.push('missing row ' + k);
  if (p.length === 0 && buildMatrix(matrix.rows, keys).status !== matrix.status) p.push('matrix status does not follow rows');
  return p;
}

export function layoutFindings(vp, { scrollWidth, items }) {
  const f = [];
  if (scrollWidth > vp.width) f.push('horizontal overflow ' + scrollWidth + '>' + vp.width);
  for (const i of items) {
    if (i.x < -0.5 || i.y < -0.5 || i.x + i.width > vp.width + 0.5 || i.y + i.height > vp.height + 0.5) f.push('clipped by viewport: ' + i.name);
    if (i.clipped) f.push('text clipped: ' + i.name);
  }
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const p = items[a], q = items[b];
    const w = Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x);
    const h = Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y);
    if (w > 1 && h > 1) f.push('overlap: ' + p.name + ' / ' + q.name);
  }
  return f;
}

export function numericDiff(a, b, prefix = '', depth = 0) {
  if (typeof a === 'number' && typeof b === 'number') return a !== b ? [prefix] : [];
  const out = [];
  if (depth < 3 && a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of Object.keys(a)) out.push(...numericDiff(a[k], b[k], prefix + '.' + k, depth + 1));
  }
  return out;
}

// Actual runtime contract: browser-worker exposes diagnostics with its backend; main-thread has kind only (no diagnosticState).
export function backendProblem(mode, s) {
  if (mode === 'worker') return s.kind === 'browser-worker' && s.diag?.executionBackend === 'browser-worker' ? null : 'worker kind/diag mismatch ' + JSON.stringify({ kind: s.kind, diag: s.diag });
  return s.kind === 'main-thread' && (s.diag === null || s.diag.executionBackend === 'main-thread') ? null : 'main kind/state mismatch ' + JSON.stringify({ kind: s.kind, diag: s.diag });
}

const MEASURE = () => ({
  scrollWidth: globalThis.document.documentElement.scrollWidth,
  items: [...globalThis.document.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect(), s = globalThis.getComputedStyle(b);
    return { name: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 40), x: r.x, y: r.y, width: r.width, height: r.height,
      visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none', clipped: b.scrollWidth > b.clientWidth + 1 };
  }).filter((i) => i.visible),
});

const READ = async () => {
  const { useSimStore } = await import('/src/store/simStore.ts');
  const { getSimulationRuntime } = await import('/src/sim/simulationRuntime.ts');
  const s = useSimStore.getState(), rt = getSimulationRuntime();
  return { status: s.status, aircraft: s.aircraft, throttle1: s.pilotInputs.throttle1, commit: s.simulationCommit,
    observationAgeMs: s.simulationCommit ? Math.max(0, globalThis.performance.now() - s.simulationCommit.committedAtMs) : null,
    kind: rt.kind, diag: rt.diagnosticState?.() ?? null, failure: s.simulationFailure };
};
const STATUS = async (want) => { const { useSimStore } = await import('/src/store/simStore.ts'); return useSimStore.getState().status === want; };

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const brief = (s) => ({ status: s.status, throttle1: s.throttle1, kind: s.kind, diag: s.diag, failure: s.failure, observationAgeMs: s.observationAgeMs,
  commit: s.commit, aircraftSha256: sha(JSON.stringify(s.aircraft)) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Old T19 composed hook (verbatim logic): observes the real CesiumWidget so quality is read from the widget, not from policy strings.
async function installComposed({ cesiumUrl }) {
  const C = await import(cesiumUrl); const original = C.CesiumWidget.prototype.render;
  const data = { active: false, frames: [], renderCalls: 0, renderMs: 0, widget: null, quality: null }; globalThis.__t19Composed = data;
  C.CesiumWidget.prototype.render = function (...args) { data.widget = this; return original.apply(this, args); };
}
// Trusted Worker error/messageerror observation: listeners on the real Worker objects; events are the browser's own.
function installWorkerEvents() {
  const W = globalThis.Worker; globalThis.__rfsWorkerEvents = [];
  globalThis.Worker = class extends W {
    constructor(...a) { super(...a); for (const t of ['error', 'messageerror']) this.addEventListener(t, (e) => globalThis.__rfsWorkerEvents.push({ type: e.type, isTrusted: e.isTrusted, message: e.message ?? null, url: String(a[0]).slice(0, 120) })); }
  };
}
function installVisibility() {
  globalThis.__rfsVis = [];
  globalThis.document.addEventListener('visibilitychange', (e) => globalThis.__rfsVis.push({ state: globalThis.document.visibilityState, isTrusted: e.isTrusted }));
}

function installRoutes(ctx, denied, onWorker) {
  return ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) { denied.push(u.origin + u.pathname); return route.abort('blockedbyclient'); }
    if (u.pathname === '/__e2e_metar') return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ wdir: 280, wspd: 20, wgst: 28, tmp: 25, altim: 1030, visib: 9000, clouds: [] }]) });
    if (onWorker && /simulationWorker/.test(u.pathname)) { onWorker.push(u.pathname + u.search); return route.abort('failed'); }
    return route.continue();
  });
}

async function main() {
  const { cohort, lifecycle } = parseSelector(process.argv.slice(2)), keys = lifecycle ? lifecycleKeys() : cohortControls(cohort), [vpName, mode] = cohort.split('-'), viewport = VIEWPORTS[vpName];
  const cwd = process.cwd(), req = createRequire(cwd + '/');
  const { chromium, expect } = req('@playwright/test'); const ts = req('typescript');
  const { createServer } = await import(cwd + '/node_modules/vite/dist/node/index.js');
  const T0 = Date.now();
  const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  const records = []; let peak = 0;
  const scratch = () => { const s = fs.statfsSync(process.env.RFS_SCRATCH); peak = Math.max(peak, (s.blocks - s.bfree) * s.bsize); };
  const rec = (control, status, evidence, reason) => { const r = { kind: 'control', key: cohort + ':' + control, cohort, control, status, evidence: evidence ?? null, reason: reason ?? null }; records.push(r); emit(r); };
  const run = async (control, fn) => { if (lifecycle && !['start-roll', ...LIFECYCLE_CONTROLS].includes(control)) return; try { const ev = await fn(); if (ev?.blocked) rec(control, 'BLOCKED', ev.evidence, ev.blocked); else rec(control, 'PASS', ev); } catch (e) { rec(control, 'FAIL', null, String(e?.stack ?? e).slice(0, 4000)); } };
  // Required screenshots are always embedded; an over-size one fails the layout/final control instead of being omitted.
  const shot = async (page, name) => {
    const buf = await page.screenshot({ type: 'jpeg', quality: 40 });
    if (buf.length > 300000) throw new Error('screenshot ' + name + ' too large: ' + buf.length);
    emit({ kind: 'screenshot', name, bytes: buf.length, sha256: sha(buf), base64: buf.toString('base64') });
    return { name, bytes: buf.length, sha256: sha(buf) };
  };
  const tmp = process.env.TMPDIR;
  if (!tmp || !fs.statSync(tmp).isDirectory()) throw new Error('TMPDIR is not an existing directory: ' + tmp);
  const specPath = cwd + '/e2e/rfs-runtime-latency.spec.ts', specText = fs.readFileSync(specPath, 'utf8');
  const source = ts.createSourceFile(specPath, specText, ts.ScriptTarget.Latest, true);
  const node = source.statements.find((s) => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && s.expression.arguments[0]?.text === 'commands accepted during actual worker turns fence stale modes, routes, pause and reset').expression.arguments[1];
  const callback = new Function('expect', ts.transpile('const callback = ' + node.getText(source) + ';', { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }) + '\nreturn callback;')(expect);

  // Real headed Chromium under the already-installed Xvfb (DISPLAY from the runner); otherwise headless and tab-hidden is BLOCKED.
  const headed = process.env.RFS_HEADED === '1' && !!process.env.DISPLAY;
  let browser, server, chrome;
  try {
  browser = await chromium.launch({ executablePath: process.env.RFS_NATIVE_BROWSER, headless: !headed, ignoreDefaultArgs: ['--mute-audio'], args: ['--enable-unsafe-swiftshader'], timeout: 30000 });
  chrome = browser.version();
  process.env.VITE_RFS_VISUAL_TEST = '0'; process.env.VITE_METAR_API_URL = ORIGIN + '/__e2e_metar';
  process.env.VITE_RFS_WORKER_PHYSICS = mode === 'worker' ? '1' : '0';
  fs.mkdirSync(tmp + '/vite-cache', { recursive: true });
  // configLoader 'runner' loads the same vite.config.ts without writing a temp bundle under the read-only checkout.
  server = await createServer({ root: cwd, envDir: false, configLoader: 'runner', cacheDir: tmp + '/vite-cache', server: { host: '127.0.0.1', port: 5197, strictPort: true }, logLevel: 'warn' });
    await server.listen();
    const transformed = await server.transformRequest('/src/viewport/CesiumViewport.tsx');
    const match = transformed.code.match(/import \* as Cesium from ["']([^"']+)["']/);
    if (!match) throw new Error('actual transformed Cesium import not found');
    const cesiumUrl = new URL(match[1], ORIGIN).href;
    const mkctx = () => browser.newContext({ baseURL: ORIGIN, viewport, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const ctx = await mkctx(); const denied = [], pageErrors = [];
    try {
      await installRoutes(ctx, denied); await ctx.addInitScript(installComposed, { cesiumUrl }); await ctx.addInitScript(installVisibility);
      const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 500)));
      await page.goto(ORIGIN + '/?quality=high', { timeout: 30000 });
      const loaded = await page.waitForFunction(() => globalThis.document.querySelector('[data-testid="cesium-viewport"]')?.dataset.rfsReady === 'true' && globalThis.__t19Composed?.widget, {}, { timeout: 45000 }).then(() => true, (e) => String(e));
      await run('scene-fidelity', async () => {
        if (loaded !== true) throw new Error('app never reached rfsReady with a CesiumWidget: ' + loaded);
        await page.waitForFunction(() => globalThis.document.querySelectorAll('canvas').length >= 2, {}, { timeout: 10000 });
        const s = await page.evaluate(async () => { const { getCesiumScenePolicy } = await import('/src/config/cesium.ts'); const { getSimulationRuntime } = await import('/src/sim/simulationRuntime.ts'); const w = globalThis.__t19Composed.widget;
          return { viewport: { width: globalThis.innerWidth, height: globalThis.innerHeight }, quality: new globalThis.URLSearchParams(globalThis.location.search).get('quality'), policy: getCesiumScenePolicy(), runtime: getSimulationRuntime().kind, canvases: globalThis.document.querySelectorAll('canvas').length,
            widget: { targetFrameRate: w.targetFrameRate, resolutionScale: w.resolutionScale, msaaSamples: w.scene.msaaSamples, globeSse: w.scene.globe.maximumScreenSpaceError, waterEffect: w.scene.globe.showWaterEffect } }; });
        const want = mode === 'worker' ? 'browser-worker' : 'main-thread';
        if (JSON.stringify(s.viewport) !== JSON.stringify(viewport) || s.quality !== 'high' || s.policy.mode !== 'degraded' || s.policy.terrain !== 'ellipsoid' || s.policy.osmBuildings !== false || s.runtime !== want) throw new Error('scene/runtime mismatch ' + JSON.stringify(s));
        if (JSON.stringify(s.widget) !== JSON.stringify(WIDGET_QUALITY)) throw new Error('actual CesiumWidget quality mismatch ' + JSON.stringify(s.widget));
        return { ...s, instrumentHook: 'actual CesiumWidget.render (old T19 installComposed)', deniedBrowserRequests: denied.slice(0, 20) };
      });
      await run('layout', async () => {
        const m = await page.evaluate(MEASURE); const f = layoutFindings(viewport, m);
        const sh = await shot(page, 'layout-' + cohort);
        if (f.length) throw new Error('layout failures retained: ' + JSON.stringify({ findings: f, shot: sh, buttons: m.items }).slice(0, 3500));
        return { buttons: m.items.length, shot: sh };
      });
      let initial, running;
      await run('camera', async () => {
        const b = page.getByRole('button', { name: /^CAM:/ }); const before = await b.innerText(); await b.click({ timeout: 5000 }); const after = await b.innerText();
        if (before === after) throw new Error('camera label unchanged ' + before); return { before, after };
      });
      await run('start-roll', async () => {
        initial = await page.evaluate(READ);
        await page.getByRole('button', { name: 'START ROLL', exact: true }).click({ timeout: 5000 });
        await page.waitForFunction(STATUS, 'running', { timeout: 5000 }); await sleep(800);
        running = await page.evaluate(READ);
        const moved = numericDiff(initial.aircraft, running.aircraft), bp = backendProblem(mode, running);
        if (running.failure !== null || !moved.length || bp || JSON.stringify(running.commit) === JSON.stringify(initial.commit)) throw new Error('no actual physics/backend proof ' + JSON.stringify({ bp, moved, a: brief(initial), b: brief(running) }));
        return { changedNumericFields: moved.slice(0, 12), initial: brief(initial), running: brief(running) };
      });
      await run('keyboard', async () => {
        await page.keyboard.press('ArrowUp'); await page.waitForFunction(async (t) => { const { useSimStore } = await import('/src/store/simStore.ts'); return useSimStore.getState().pilotInputs.throttle1 > t; }, running.throttle1, { timeout: 5000 });
        const s = await page.evaluate(READ); if (s.failure !== null) throw new Error('simulation failure after key'); return { before: running.throttle1, after: s.throttle1, state: brief(s) };
      });
      if (vpName === 'desktop') await run('tab-hidden-resume', async () => {
        if (!headed) return { blocked: 'no headed Chromium/Xvfb display available (RFS_HEADED/DISPLAY unset); headless activation is not proved to change visibility; nothing counterfeited', evidence: { headed } };
        // Supported CDP native window minimize/restore; tab activation does not hide a headed window's page.
        const cdp = await ctx.newCDPSession(page);
        let windowId;
        try { ({ windowId } = await cdp.send('Browser.getWindowForTarget')); } catch (e) { await cdp.detach().catch(() => {}); return { blocked: 'CDP Browser.getWindowForTarget unavailable: ' + String(e).slice(0, 300), evidence: { headed } }; }
        const setState = (windowState) => cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
        try {
          await setState('minimized');
          const hidden = await page.waitForFunction(() => globalThis.document.visibilityState === 'hidden', {}, { polling: 50, timeout: 3000 }).then(() => true, () => false);
          await sleep(500); const during = await page.evaluate(READ);
          await setState('normal');
          const visible = await page.waitForFunction(() => globalThis.document.visibilityState === 'visible', {}, { polling: 50, timeout: 3000 }).then(() => true, () => false);
          await sleep(500); const after = await page.evaluate(READ); const events = await page.evaluate(() => globalThis.__rfsVis);
          const evidence = { headed, hidden, visible, events, during: brief(during), after: brief(after) };
          const trusted = (st) => events.some((e) => e.state === st && e.isTrusted === true);
          if (!hidden) return { blocked: 'headed Chromium did not report hidden after CDP window minimize; no counterfeit hidden event produced', evidence };
          if (!visible || after.failure !== null || after.status !== 'running' || !trusted('hidden') || !trusted('visible')) throw new Error('resume proof failed ' + JSON.stringify(evidence));
          return evidence;
        } finally { await setState('normal').catch(() => {}); await cdp.detach().catch(() => {}); }
      });
      await run('pause', async () => {
        await page.getByRole('button', { name: 'PAUSE', exact: true }).click({ timeout: 5000 }); await page.waitForFunction(STATUS, 'paused', { timeout: 5000 });
        const paused = await page.evaluate(READ); await sleep(500); const later = await page.evaluate(READ);
        if (numericDiff(paused.aircraft, later.aircraft).length) throw new Error('aircraft advanced while paused');
        return { paused: brief(paused), later: brief(later) };
      });
      await run('reset', async () => {
        await page.getByRole('button', { name: 'RESET', exact: true }).click({ timeout: 5000 }); await page.waitForFunction(STATUS, 'stopped', { timeout: 5000 });
        const s = await page.evaluate(READ);
        if (s.throttle1 !== initial.throttle1 || s.failure !== null) throw new Error('reset did not restore inputs ' + JSON.stringify({ s: brief(s), initial: brief(initial) }));
        return { reset: brief(s), shot: await shot(page, 'final-' + cohort) };
      });
      // Happy path: any page error here is a failure. Injected faults below use their own pages and are counted separately.
      await run('no-unexpected-pageerrors', async () => {
        if (pageErrors.length) throw new Error('happy-cohort pageErrors: ' + JSON.stringify(pageErrors.slice(0, 5)));
        return { pageErrorCount: 0 };
      });
      let fixturePage;
      const fixture = async () => { fixturePage ??= await ctx.newPage(); if (!fixturePage.url().includes('/e2e/fixtures/runtime.html')) await fixturePage.goto(ORIGIN + '/e2e/fixtures/runtime.html', { timeout: 20000 }); return fixturePage; };
      if (mode === 'worker') await run('stale-fence-spec', async () => {
        const p2 = await fixture();
        await callback({ page: p2 }, { attach: async () => {} });
        return { viewport: await p2.evaluate(() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight })), scope: 'existing spec callback (TypeScript-AST extracted, transpiled) incl. all expect assertions' };
      });
      if (cohort === 'desktop-worker') {
        await run('worker-error', async () => {
          const c2 = await mkctx(); const aborted = [], d2 = [], errs = [];
          try {
            await installRoutes(c2, d2, aborted); await c2.addInitScript(installWorkerEvents); const p = await c2.newPage(); p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
            await p.goto(ORIGIN + '/?quality=high', { timeout: 30000 });
            await p.waitForFunction(() => globalThis.document.querySelector('[data-testid="cesium-viewport"]')?.dataset.rfsReady === 'true', {}, { timeout: 45000 });
            await p.getByRole('button', { name: 'START ROLL', exact: true }).click({ timeout: 5000 });
            let s; for (let i = 0; i < 40; i++) { s = await p.evaluate(READ); if (s.failure !== null || s.diag?.executionBackend !== 'browser-worker') break; await sleep(200); }
            const events = await p.evaluate(() => globalThis.__rfsWorkerEvents);
            const evidence = { abortedWorkerRequests: aborted.slice(0, 5), expectedInjectedPageErrors: errs.slice(0, 5), workerEvents: events, observed: brief(s) };
            if (!aborted.length) throw new Error('browser never requested the worker script ' + JSON.stringify(evidence));
            if (!events.some((e) => e.type === 'error' && e.isTrusted === true)) throw new Error('no trusted Worker error event observed ' + JSON.stringify(evidence));
            if (s.failure === null && s.diag?.executionBackend === 'browser-worker') throw new Error('app showed no reaction to worker error ' + JSON.stringify(evidence));
            return evidence;
          } finally { await c2.close(); }
        });
        const p3 = await fixture();
        await run('worker-messageerror', async () => {
          const r = await p3.evaluate(messageErrorProbe);
          const trusted = r.events.some((e) => e.type === 'messageerror' && e.isTrusted === true);
          if (!trusted || r.fallbackCalls !== 1) return { blocked: 'UNPROVEN: authored data-URL Worker returning an empty WebAssembly.Module produced no trusted messageerror with SUT fallback; no supported mechanism, nothing counterfeited', evidence: r };
          return r;
        });
        let rows = []; const protocolScenarios = lifecycle ? [] : PROTOCOL_SCENARIOS;
        try { rows = lifecycle ? [] : (await p3.evaluate(nativeAdverse)).rows; } catch (e) { for (const s of protocolScenarios) rec('protocol:' + s, 'FAIL', null, 'protocol controls aborted: ' + String(e?.stack ?? e).slice(0, 1500)); }
        for (const s of protocolScenarios) { const row = rows.find((x) => x.scenario === s); if (row && !records.some((r) => r.control === 'protocol:' + s)) rec('protocol:' + s, row.status === 'PASS' ? 'PASS' : 'FAIL', row.status === 'PASS' ? row : null, row.status === 'PASS' ? null : 'row status ' + row.status); }
        for (const s of protocolScenarios) if (!records.some((r) => r.control === 'protocol:' + s)) rec('protocol:' + s, 'FAIL', null, 'protocol scenario produced no row');
      }
    } finally { await ctx.close(); scratch(); }
  } finally { try { await server?.close(); } finally { await browser?.close(); scratch(); } }
  emit({ kind: 'matrix', ...buildMatrix(records, keys) });
  emit({ kind: 'summary', cohort, headed, elapsedMs: Date.now() - T0, scratchPeakBytes: peak, node: process.version, chrome });
}

// Real Worker fed an authored WebAssembly.Module reply through the SUT's BrowserWorkerSimulationRuntime. Whether this raises a
// trusted messageerror is unproven; the caller records the actual observation.
export async function messageErrorProbe() {
  const { useSimStore } = await import('/src/store/simStore.ts');
  const { BrowserWorkerSimulationRuntime, MainThreadSimulationRuntime } = await import('/src/sim/simulationRuntime.ts');
  useSimStore.getState().reset(); useSimStore.getState().start();
  const x = useSimStore.getState(), main = new MainThreadSimulationRuntime(), count = { calls: 0 }, events = [];
  const input = { aircraft: x.aircraft, spec: x.spec, pilotInputs: x.pilotInputs, apState: x.apState, flightPlan: x.flightPlan, activeLegIndex: x.activeLegIndex, routeStatus: x.routeStatus, wind: x.wind, weather: x.weather, dt: 1 / 60, status: 'running', selectedScenarioId: x.selectedScenarioId, guidance: x.guidance, apControllerState: x.apControllerState, cloneAircraft: true, steps: 1 };
  const w = new globalThis.Worker('data:text/javascript,' + encodeURIComponent('onmessage=()=>postMessage(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])))'));
  for (const t of ['message', 'messageerror', 'error']) w.addEventListener(t, (e) => events.push({ type: t, isTrusted: e.isTrusted }));
  const r = new BrowserWorkerSimulationRuntime({ worker: w, fallback: { kind: 'main-thread', step(i) { count.calls++; return main.step(i); } }, timeoutMs: 3000 });
  let rejection = null;
  try { await r.stepAsync(input); } catch (e) { rejection = { name: e.name, message: String(e.message).slice(0, 200) }; } finally { r.dispose(); }
  return { events, fallbackCalls: count.calls, rejection, diagnostic: r.diagnosticState?.() ?? null };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { process.stderr.write(String(e?.stack ?? e) + '\n'); process.exitCode = 1; });
}

// ---- Old T19 native adverse protocol controls (verbatim page function; its injected messageerror row is not mapped) ----
async function nativeAdverse(){
 const {useSimStore}=await import('/src/store/simStore.ts');
 const {BrowserWorkerSimulationRuntime,MainThreadSimulationRuntime,createSimulationRuntime,setSimulationRuntimeForTests}=await import('/src/sim/simulationRuntime.ts');
 const {createDefaultAutopilotState}=await import('/src/instruments/defaultAutopilotState.ts');
 const {createRunwayToRunwayFlight}=await import('/src/sim/flightPlanLoader.ts');
 const {APP_BUILD_COHORT}=await import('/src/config/buildIdentity.ts');
 const ok=(condition,message)=>{if(!condition)throw Error(message);};const same=(a,b,label)=>ok(JSON.stringify(a)===JSON.stringify(b),label);
 const wait=async pred=>{const end=globalThis.performance.now()+10000;while(!pred()){ok(globalThis.performance.now()<end,'native adverse deadline');await new Promise(r=>globalThis.setTimeout(r,5));}};
 const seed=()=>{useSimStore.getState().reset();useSimStore.getState().start();const x=useSimStore.getState();return{aircraft:x.aircraft,spec:x.spec,pilotInputs:x.pilotInputs,apState:x.apState,flightPlan:x.flightPlan,activeLegIndex:x.activeLegIndex,routeStatus:x.routeStatus,wind:x.wind,weather:x.weather,dt:1/60,status:'running',selectedScenarioId:x.selectedScenarioId,guidance:x.guidance,apControllerState:x.apControllerState,cloneAircraft:true,steps:1};};
 const main=new MainThreadSimulationRuntime(),rows=[];
 class NativeDelivery {
  constructor(url='/src/sim/simulationWorker.ts?worker_file&type=module'){this.worker=new globalThis.Worker(url,{type:'module'});this.listeners=new Map();this.messages=[];this.replies=[];this.errors=[];this.worker.addEventListener('message',event=>{this.replies.push(event.data);if(this.auto)this.deliver(event.data);});this.worker.addEventListener('error',event=>{this.errors.push({message:event.message,isTrusted:event.isTrusted});for(const f of this.listeners.get('error')??[])f();});}
  addEventListener(type,f){const set=this.listeners.get(type)??new Set();set.add(f);this.listeners.set(type,set);}
  removeEventListener(type,f){this.listeners.get(type)?.delete(f);}
  postMessage(message){this.messages.push(message);this.worker.postMessage(message);}
  deliver(data){for(const f of this.listeners.get('message')??[])f({data});}
  terminate(){this.worker.terminate();}
 }
 const fallback=counter=>({kind:'main-thread',step(input){counter.calls++;return main.step(input);}});
 // True browser-worker/main semantic parity at identical explicit command boundaries.
 const semanticRun=async worker=>{
  seed();const runtime=createSimulationRuntime({env:{VITE_RFS_WORKER_PHYSICS:worker?'1':'0'},workerTimeoutMs:10000,...(worker?{fallback:{kind:'main-thread',step(){throw Error('parity fallback forbidden');}}}:{})});ok(runtime.kind===(worker?'browser-worker':'main-thread'),'parity runtime');const restore=setSimulationRuntimeForTests(runtime);const base={...useSimStore.getState().commandRevisions},snapshots=[];
  try{for(const command of [()=>useSimStore.getState().setInput({throttle1:.6,throttle2:.6}),()=>useSimStore.getState().setApState(createDefaultAutopilotState()),()=>useSimStore.getState().setApState(null),()=>useSimStore.getState().setFlightPlan(createRunwayToRunwayFlight({originAirport:'KSEA',originRunway:'16L',destinationAirport:'KPDX',destinationRunway:'10R'})),()=>{useSimStore.getState().stageDirectTo('KSEAKPDX_ENR');useSimStore.getState().executeRouteEdit();},()=>useSimStore.getState().applyInputActions({trimDelta:.2},1/60)]){
    command();useSimStore.setState({lastFrameTime:16,fixedStepAccumulatorSeconds:1/60});useSimStore.getState().tickAsync(16);await wait(()=>!useSimStore.getState().asyncPhysicsInFlight);const s=useSimStore.getState(),c=s.simulationCommit;ok(c&&s.simulationFailure===null,'semantic commit');snapshots.push(globalThis.structuredClone({aircraft:s.aircraft,pilot:s.pilotInputs,effective:s.effectiveControls,ap:s.apState,controllers:s.apControllerState,flightPlan:s.flightPlan,route:s.routeStatus,guidance:s.guidance,observation:c.observation,step:c.stepIndex,applied:Object.fromEntries(Object.entries(c.revisions).map(([k,v])=>[k,v-base[k]]))}));
   }if(worker)ok(runtime.diagnosticState().executionBackend==='browser-worker'&&runtime.diagnosticState().observedWorkerCohort===APP_BUILD_COHORT,'actual parity backend/cohort');return snapshots;
  }finally{restore();runtime.dispose?.();}
 };
 const mainSnapshots=await semanticRun(false),workerSnapshots=await semanticRun(true);same(workerSnapshots,mainSnapshots,'actual native worker/main explicit schedule parity');rows.push({scenario:'native-worker/main-six-command-physical-control-route-observation-parity',status:'PASS',mainSnapshots,workerSnapshots});
 // Native responses delivered second-first, then duplicates/late malformed ID.
 {
  const d=new NativeDelivery(),count={calls:0},r=new BrowserWorkerSimulationRuntime({worker:d,fallback:fallback(count),timeoutMs:10000,maxPendingRequests:2});
  try{const a=seed(),b=globalThis.structuredClone(a);b.pilotInputs.throttle1=.2;const expected=[main.step(a),main.step(b)],first=r.stepAsync(a),second=r.stepAsync(b);await wait(()=>d.replies.length===2);d.deliver(d.replies[1]);const out2=await second;d.deliver({...d.replies[1],protocolVersion:99});d.deliver(d.replies[1]);d.deliver(d.replies[0]);const out1=await first;d.deliver(d.replies[0]);same([out1,out2],expected,'out of order physical parity');ok(count.calls===0,'duplicate fallback');rows.push({scenario:'native-payload-out-of-order-duplicate-late-delivery',status:'PASS',nativeResponses:d.replies.length,fallbackCalls:count.calls,deliveryOrder:[2,2,2,1,1],physical:[out1,out2]});}finally{r.dispose();}
 }
 for(const fault of ['cohort','nonfinite','timeout-snapshot','dispose','messageerror-injected']){
  const d=new NativeDelivery(),count={calls:0},r=new BrowserWorkerSimulationRuntime({worker:d,fallback:fallback(count),timeoutMs:fault==='timeout-snapshot'?200:10000});
  try{const data=seed(),expected=globalThis.structuredClone(main.step(data));let rejection=null;const pending=r.stepAsync(data).catch(e=>{rejection={name:e.name,message:e.message,nativeInvalidResultPresent:Boolean(e.result)};return null;});if(fault==='timeout-snapshot'){data.pilotInputs.throttle1=4;data.aircraft.simTime=99999;}await wait(()=>d.replies.length===1);
   if(fault==='cohort')d.deliver({...d.replies[0],buildCohort:'authored-foreign-cohort'});
   if(fault==='nonfinite'){d.replies[0].result.aircraft.velocity.u=NaN;d.deliver(d.replies[0]);}
   if(fault==='timeout-snapshot'){data.pilotInputs.throttle1=4;data.aircraft.simTime=99999;}
   if(fault==='dispose')r.dispose();
   if(fault==='messageerror-injected'){for(const f of d.listeners.get('messageerror')??[])f();for(const f of d.listeners.get('messageerror')??[])f();}
   const out=await pending;
   if(fault==='nonfinite'){ok(rejection?.name==='InvalidSimulationStateError'&&count.calls===0,'invalid numerical result must reject without recompute');}
   else{same(out,expected,'validated fallback snapshot parity '+fault);ok(count.calls===1,'fallback settles exactly once '+fault);}
   rows.push({scenario:fault,status:'PASS',nativeResponses:d.replies.length,expectedFallbackCalls:fault==='nonfinite'?0:1,fallbackCalls:count.calls,rejection,physical:out,diagnostic:r.diagnosticState(),messageerrorOrigin:fault==='messageerror-injected'?'explicit boundary injection over a real native worker; NOT a native deserialization messageerror':null});
  }finally{r.dispose();}
 }
 // A genuine worker-thread uncaught exception produces a trusted error event.
 {
  const url=globalThis.URL.createObjectURL(new globalThis.Blob(['onmessage=()=>{throw new Error("authored-native-worker-crash")};'],{type:'text/javascript'})),d=new NativeDelivery(url),count={calls:0},r=new BrowserWorkerSimulationRuntime({worker:d,fallback:fallback(count),timeoutMs:10000});
  try{const input=seed(),expected=main.step(input),out=await r.stepAsync(input);same(out,expected,'native crash fallback parity');ok(d.errors.some(e=>e.isTrusted&&e.message.includes('authored-native-worker-crash'))&&count.calls===1,'actual native crash error');rows.push({scenario:'actual-native-worker-crash',status:'PASS',errors:d.errors,fallbackCalls:count.calls,physical:out});}finally{r.dispose();globalThis.URL.revokeObjectURL(url);}
 }
 // Actual worker execution rejects nonfinite dynamics, without fake success.
 {
  const r=createSimulationRuntime({env:{VITE_RFS_WORKER_PHYSICS:'1'},workerTimeoutMs:10000,fallback:{kind:'main-thread',step(){throw Error('numerical fault must not fallback');}}});let rejected=null;
  try{const input=seed();input.aircraft.velocity.u=1e300;try{await r.stepAsync(input);}catch(e){rejected={name:e.name,message:e.message,invalidVelocityIsNaN:Number.isNaN(e.result?.aircraft?.velocity?.u)};}ok(rejected?.name==='InvalidSimulationStateError'&&rejected.invalidVelocityIsNaN,'actual worker numerical failure evidence');rows.push({scenario:'actual-worker-nonfinite-execution',status:'PASS',rejected});}finally{r.dispose();}
 }
 // Real worker result held while newer trim intent is accepted; no fake physics.
 {
  seed();useSimStore.setState({fixedStepAccumulatorSeconds:32/60,lastFrameTime:16,simRate:4});const native=createSimulationRuntime({env:{VITE_RFS_WORKER_PHYSICS:'1'},workerTimeoutMs:10000,fallback:{kind:'main-thread',step(){throw Error('trim fallback forbidden');}}}),turns=[];
  const wrapper={kind:native.kind,step:native.step.bind(native),stepAsync:async input=>{let release;const barrier=new Promise(r=>release=r);const turn={input:globalThis.structuredClone(input),release,nativeDone:false};turns.push(turn);const result=await native.stepAsync(input);turn.nativeDone=true;await barrier;return result;}},restore=setSimulationRuntimeForTests(wrapper);
  try{useSimStore.getState().tickAsync(16);await wait(()=>turns.length===1);const generation=useSimStore.getState().asyncPhysicsGeneration,oldTrim=turns[0].input.aircraft.config.stabilizerTrimUnits;useSimStore.getState().applyInputActions({trimDelta:1},1/60);const intent=useSimStore.getState().inputManager.stabilizerTrimUnits;ok(intent!==oldTrim&&useSimStore.getState().asyncPhysicsGeneration===generation,'held trim keeps generation');turns[0].release();await wait(()=>turns.length===2);const middle=globalThis.structuredClone({intent:useSimStore.getState().aircraft.config.stabilizerTrimUnits,observed:useSimStore.getState().simulationCommit.observation.aircraft.config.stabilizerTrimUnits,commit:useSimStore.getState().simulationCommit});ok(middle.intent===intent&&middle.observed===oldTrim&&turns[1].input.aircraft.config.stabilizerTrimUnits===intent,'trim observation vs intent');turns[1].release();await wait(()=>!useSimStore.getState().asyncPhysicsInFlight);rows.push({scenario:'held-trim-during-real-worker',status:'PASS',generation,oldTrim,intent,middle,nativeResponses:turns.filter(t=>t.nativeDone).length,stepIndex:useSimStore.getState().simulationCommit.stepIndex});}finally{for(const t of turns)t.release();restore();native.dispose();}
 }
 {
  seed();const native=createSimulationRuntime({env:{VITE_RFS_WORKER_PHYSICS:'1'},workerTimeoutMs:10000,fallback:{kind:'main-thread',step(){throw Error('catchup fallback forbidden');}}}),requests=[],wrapper={kind:native.kind,step:native.step.bind(native),stepAsync:input=>{requests.push(input.steps);return native.stepAsync(input);}},restore=setSimulationRuntimeForTests(wrapper);
  try{useSimStore.setState({lastFrameTime:1000});await useSimStore.getState().catchUpBackgroundTime(4000);const s=useSimStore.getState();ok(Math.abs(s.simulationTimeSeconds-3)<1e-9&&s.droppedSimulationTimeSeconds===0&&requests.reduce((a,b)=>a+b,0)===180&&requests.every(n=>n<=1800),'source catch-up actual worker');rows.push({scenario:'source-hidden-gap-catchup-component',status:'PASS',simSeconds:s.simulationTimeSeconds,dropped:s.droppedSimulationTimeSeconds,requests,physical:s.aircraft,actualTabHideResume:false,reason:'Source catchUpBackgroundTime called directly; actual visibility lifecycle checked separately on composed scene.'});}finally{restore();native.dispose();}
 }
 return{status:'PASS',scope:'actual native worker plus controlled adverse delivery and component store paths',cohort:APP_BUILD_COHORT,rows,gaps:[{scenario:'native-messageerror',status:'UNAVAILABLE',reason:'No supported source/browser API found to trigger native deserialization failure without changing isolation/security; injected boundary event is labelled separately.'}]};
}
