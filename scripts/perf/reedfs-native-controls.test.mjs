import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'vitest';
import { COHORTS, WIDGET_QUALITY, backendProblem, buildMatrix, cohortControls, layoutFindings, numericDiff, requiredControls, validateMatrix } from './reedfs-native-controls.mjs';

const vp = { width: 390, height: 844 };
const passAll = () => requiredControls().map((key) => ({ key, status: 'PASS', evidence: { e: 1 } }));

test('layout: clean, clipped, overflow, overlap and text clipping are all reported', () => {
  const ok = { scrollWidth: 390, items: [{ name: 'A', x: 0, y: 0, width: 100, height: 40 }, { name: 'B', x: 100, y: 0, width: 100, height: 40 }] };
  assert.deepEqual(layoutFindings(vp, ok), []);
  const bad = { scrollWidth: 500, items: [{ name: 'A', x: 0, y: 0, width: 100, height: 40, clipped: true }, { name: 'B', x: 50, y: 10, width: 400, height: 40 }] };
  const f = layoutFindings(vp, bad).join('|');
  for (const part of ['horizontal overflow', 'clipped by viewport: B', 'text clipped: A', 'overlap: A / B']) assert.ok(f.includes(part), part);
});

test('matrix: missing control is BLOCKED, FAIL dominates, all PASS is PASS', () => {
  assert.equal(buildMatrix([]).status, 'BLOCKED');
  assert.equal(buildMatrix(passAll()).status, 'PASS');
  const failed = passAll(); failed[0] = { key: failed[0].key, status: 'FAIL', reason: 'x' };
  assert.equal(buildMatrix(failed).status, 'FAIL');
  const blocked = passAll(); blocked[1] = { key: blocked[1].key, status: 'BLOCKED' };
  assert.equal(buildMatrix(blocked).status, 'BLOCKED');
  assert.equal(buildMatrix(passAll().slice(1)).rows.filter((r) => r.status === 'MISSING').length, 1);
});

test('validateMatrix rejects empty, unknown, duplicate, evidence-less and inconsistent matrices', () => {
  const keys = cohortControls('desktop-worker');
  const good = buildMatrix(keys.map((key) => ({ key, status: 'PASS', evidence: { e: 1 } })), keys);
  assert.deepEqual(validateMatrix(good, keys), []);
  assert.ok(validateMatrix({ status: 'PASS', rows: [] }, keys).length);
  assert.ok(validateMatrix(null, keys).length);
  assert.ok(validateMatrix({ ...good, rows: [...good.rows, good.rows[0]] }, keys).some((x) => x.includes('duplicate')));
  assert.ok(validateMatrix({ ...good, rows: [...good.rows, { key: 'nope', status: 'PASS', evidence: {} }] }, keys).some((x) => x.includes('unknown')));
  assert.ok(validateMatrix({ ...good, rows: good.rows.map((r, i) => (i ? r : { ...r, evidence: null })) }, keys).some((x) => x.includes('without evidence')));
  assert.ok(validateMatrix({ ...good, rows: good.rows.map((r, i) => (i ? r : { ...r, status: 'FAIL', evidence: null, reason: 'r' })) }, keys).some((x) => x.includes('does not follow')));
});

test('required controls: four cohorts partition the keys and match the Python runner', () => {
  assert.equal(new Set(requiredControls()).size, requiredControls().length);
  assert.deepEqual(COHORTS.flatMap(cohortControls), requiredControls());
  assert.ok(cohortControls('desktop-worker').includes('desktop-worker:worker-messageerror'));
  assert.ok(!cohortControls('narrow-main').some((k) => k.includes('tab-hidden') || k.includes('stale-fence')));
  const py = spawnSync('python3', ['-B', '-c', "import importlib.util,json;s=importlib.util.spec_from_file_location('m','scripts/perf/reedfs-native-linux.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.expected_controls()))"], { encoding: 'utf8' });
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(JSON.parse(py.stdout), requiredControls());
});

test('backendProblem follows the actual runtime contract (main-thread has no diagnostics)', () => {
  assert.equal(backendProblem('main', { kind: 'main-thread', diag: null }), null);
  assert.ok(backendProblem('main', { kind: 'browser-worker', diag: null }));
  assert.equal(backendProblem('worker', { kind: 'browser-worker', diag: { executionBackend: 'browser-worker' } }), null);
  assert.ok(backendProblem('worker', { kind: 'browser-worker', diag: null }));
  assert.ok(backendProblem('worker', { kind: 'browser-worker', diag: { executionBackend: 'main-thread' } }));
});

test('numericDiff finds only changed numeric fields; widget quality target is the T19 value', () => {
  assert.deepEqual(numericDiff({ a: 1, b: { c: 2, d: 3 }, s: 'x' }, { a: 1, b: { c: 2, d: 4 }, s: 'y' }), ['.b.d']);
  assert.deepEqual(WIDGET_QUALITY, { targetFrameRate: 60, resolutionScale: 1, msaaSamples: 2, globeSse: 3, waterEffect: true });
});
