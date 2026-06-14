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
});
