import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

// Exercise the real CLI in a disposable sibling pair: an available but unpinned
// package must not be presented as a reproducible dependency checkout.
function unpinnedPair() {
  const root = mkdtempSync(path.join(tmpdir(), 'rfs-bootstrap-'));
  const rfs = path.join(root, 'RFS');
  const rfms = path.join(root, 'RFMS');
  mkdirSync(path.join(rfs, 'scripts'), { recursive: true });
  mkdirSync(path.join(rfms, 'shared'), { recursive: true });
  copyFileSync(path.resolve('scripts/bootstrap-rfms-shared.mjs'), path.join(rfs, 'scripts/bootstrap-rfms-shared.mjs'));
  writeFileSync(path.join(rfms, 'shared/package.json'), '{"name":"@virtual-cdu/shared"}\n');
  return { root, rfs, rfms };
}

describe('read-only shared dependency preflight', () => {
  it('refuses an unversioned sibling without modifying it', () => {
    const pair = unpinnedPair();
    try {
      const before = readFileSync(path.join(pair.rfms, 'shared/package.json'), 'utf8');
      const result = spawnSync(process.execPath, ['scripts/bootstrap-rfms-shared.mjs', '--check'], { cwd: pair.rfs, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/pinned|identity/i);
      expect(readFileSync(path.join(pair.rfms, 'shared/package.json'), 'utf8')).toBe(before);
    } finally { rmSync(pair.root, { recursive: true, force: true }); }
  });

  it('refuses a mismatched git checkout without switching or cleaning it', () => {
    const pair = unpinnedPair();
    try {
      const git = (...args) => spawnSync('git', args, { cwd: pair.rfms, encoding: 'utf8' });
      expect(git('init', '-q').status).toBe(0);
      expect(git('add', '.').status).toBe(0);
      expect(git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture').status).toBe(0);
      const head = git('rev-parse', 'HEAD').stdout;
      writeFileSync(path.join(pair.rfms, 'shared/local-wip.txt'), 'preserve me');
      const status = git('status', '--porcelain').stdout;
      const result = spawnSync(process.execPath, ['scripts/bootstrap-rfms-shared.mjs', '--check'], { cwd: pair.rfs, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('810fc9652da431eaf8978b85bf4af131605559b5');
      expect(git('rev-parse', 'HEAD').stdout).toBe(head);
      expect(git('status', '--porcelain').stdout).toBe(status);
    } finally { rmSync(pair.root, { recursive: true, force: true }); }
  });
});
