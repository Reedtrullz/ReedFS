/* global process */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const checkerPath = path.resolve('scripts/check-blackbox-e2e.mjs');
const tempRoots = [];

function makeTempRepo() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rfs-blackbox-'));
  tempRoots.push(fixtureRoot);
  fs.mkdirSync(path.join(fixtureRoot, 'e2e'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true });
  return fixtureRoot;
}

function writeManifest(fixtureRoot, entrypoints) {
  fs.writeFileSync(
    path.join(fixtureRoot, 'e2e', 'blackbox-manifest.json'),
    `${JSON.stringify({ entrypoints }, null, 2)}\n`,
  );
}

function writeFullFlightHelper(fixtureRoot) {
  fs.mkdirSync(path.join(fixtureRoot, 'e2e', 'helpers'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, 'e2e', 'helpers', 'rfsBlackbox.ts'),
    [
      'export async function readVisibleFlightPhase() { return "STOPPED"; }',
      'export async function resetThroughVisibleControls() {}',
      'export async function selectEnvaScenarioThroughVisibleControls() {}',
      'export async function selectKseaScenarioThroughVisibleControls() {}',
      'export async function selectKpdxShortFinalScenarioThroughVisibleControls() {}',
      '',
    ].join('\n'),
  );
}

function writeFullFlightSpec(fixtureRoot, source) {
  writeFullFlightHelper(fixtureRoot);
  fs.writeFileSync(path.join(fixtureRoot, 'e2e', 'rfs-full-flight-blackbox.spec.ts'), source);
  writeManifest(fixtureRoot, ['e2e/rfs-full-flight-blackbox.spec.ts']);
}

function runChecker(fixtureRoot, manifest = 'e2e/blackbox-manifest.json') {
  return spawnSync(process.execPath, [checkerPath, '--repo-root', fixtureRoot, '--manifest', manifest], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe('check-blackbox-e2e', () => {
  it('fails when a manifest-listed black-box helper imports app source', () => {
    const fixtureRoot = path.resolve('scripts/__tests__/fixtures/blackbox-e2e');
    const result = runChecker(fixtureRoot, 'forbidden-manifest.json');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('forbidden-helper.ts');
    expect(result.stderr).toContain('direct src import path');
  });

  it('rejects manifest entrypoints whose real path escapes the e2e black-box tree', () => {
    const fixtureRoot = makeTempRepo();
    fs.writeFileSync(path.join(fixtureRoot, 'src', 'hidden-entry.spec.ts'), 'export const ok = true;\n');
    fs.symlinkSync('../src', path.join(fixtureRoot, 'e2e', 'link'), 'dir');
    writeManifest(fixtureRoot, ['e2e/link/hidden-entry.spec.ts']);

    const result = runChecker(fixtureRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('hidden-entry.spec.ts');
    expect(result.stderr).toMatch(/real path resolves outside e2e\/ black-box (?:helpers|specs|surface)/);
  });

  it('rejects non-literal dynamic imports from black-box specs', () => {
    const fixtureRoot = makeTempRepo();
    fs.writeFileSync(
      path.join(fixtureRoot, 'e2e', 'dynamic-entry.spec.ts'),
      "const p = '../' + 'src/app';\nawait import(p);\n",
    );
    writeManifest(fixtureRoot, ['e2e/dynamic-entry.spec.ts']);

    const result = runChecker(fixtureRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('dynamic-entry.spec.ts');
    expect(result.stderr).toContain('non-literal dynamic import');
  });

  it('rejects comment-separated non-literal dynamic imports from black-box specs', () => {
    const fixtureRoot = makeTempRepo();
    fs.writeFileSync(
      path.join(fixtureRoot, 'e2e', 'comment-dynamic-entry.spec.ts'),
      "const p = ['..', 'src', 'app'].join('/');\nawait import /* vite-ignore */ (p);\n",
    );
    writeManifest(fixtureRoot, ['e2e/comment-dynamic-entry.spec.ts']);

    const result = runChecker(fixtureRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('comment-dynamic-entry.spec.ts');
    expect(result.stderr).toContain('non-literal dynamic import');
  });

  it('rejects CommonJS require calls from black-box specs', () => {
    const fixtureRoot = makeTempRepo();
    fs.writeFileSync(path.join(fixtureRoot, 'e2e', 'require-entry.spec.ts'), "const app = require('../src/app');\n");
    writeManifest(fixtureRoot, ['e2e/require-entry.spec.ts']);

    const result = runChecker(fixtureRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('require-entry.spec.ts');
    expect(result.stderr).toContain('CommonJS require');
  });

  it('rejects comment-separated CommonJS require calls from black-box specs', () => {
    const fixtureRoot = makeTempRepo();
    fs.writeFileSync(
      path.join(fixtureRoot, 'e2e', 'comment-require-entry.spec.ts'),
      "const p = ['..', 'src', 'app'].join('/');\nconst app = require /* node */ (p);\n",
    );
    writeManifest(fixtureRoot, ['e2e/comment-require-entry.spec.ts']);

    const result = runChecker(fixtureRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('comment-require-entry.spec.ts');
    expect(result.stderr).toContain('CommonJS require');
  });

  it('rejects full-flight specs that import the KPDX short-final scenario helper', () => {
    const fixtureRoot = makeTempRepo();
    writeFullFlightSpec(
      fixtureRoot,
      [
        "import { readVisibleFlightPhase, resetThroughVisibleControls, selectEnvaScenarioThroughVisibleControls, selectKpdxShortFinalScenarioThroughVisibleControls } from './helpers/rfsBlackbox';",
        "await selectEnvaScenarioThroughVisibleControls(page);",
        "expect(await readVisibleFlightPhase(page)).toBe('STOPPED');",
        '// Final reset section: continuous ENVA-to-ENGM proof already reached STOPPED.',
        'await resetThroughVisibleControls(page);',
        'void selectKpdxShortFinalScenarioThroughVisibleControls;',
        '',
      ].join('\n'),
    );

    const result = runChecker(fixtureRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('rfs-full-flight-blackbox.spec.ts');
    expect(result.stderr).toContain('KPDX short-final scenario helper');
  });

  it('rejects full-flight specs that reset before the final STOPPED reset section', () => {
    const fixtureRoot = makeTempRepo();
    writeFullFlightSpec(
      fixtureRoot,
      [
        "import { readVisibleFlightPhase, resetThroughVisibleControls, selectEnvaScenarioThroughVisibleControls } from './helpers/rfsBlackbox';",
        "await selectEnvaScenarioThroughVisibleControls(page);",
        'await resetThroughVisibleControls(page);',
        "expect(await readVisibleFlightPhase(page)).toBe('STOPPED');",
        '// Final reset section: continuous ENVA-to-ENGM proof already reached STOPPED.',
        '',
      ].join('\n'),
    );

    const result = runChecker(fixtureRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('calls resetThroughVisibleControls before the final reset section');
  });

  it('rejects full-flight specs that switch scenarios mid-proof', () => {
    const fixtureRoot = makeTempRepo();
    writeFullFlightSpec(
      fixtureRoot,
      [
        "import { readVisibleFlightPhase, resetThroughVisibleControls, selectEnvaScenarioThroughVisibleControls, selectKseaScenarioThroughVisibleControls } from './helpers/rfsBlackbox';",
        "await selectEnvaScenarioThroughVisibleControls(page);",
        "await selectKseaScenarioThroughVisibleControls(page);",
        "expect(await readVisibleFlightPhase(page)).toBe('STOPPED');",
        '// Final reset section: continuous ENVA-to-ENGM proof already reached STOPPED.',
        'await resetThroughVisibleControls(page);',
        '',
      ].join('\n'),
    );

    const result = runChecker(fixtureRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('split KSEA climb scenario helper');
    expect(result.stderr).toContain('must select only ENVA once');
  });
});
