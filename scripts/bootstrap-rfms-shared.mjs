#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RFMS_DIR = resolve(ROOT_DIR, '..', 'RFMS');
const RFMS_SHARED_PACKAGE = resolve(RFMS_DIR, 'shared', 'package.json');
const RFMS_REPO_URL = 'https://github.com/Reedtrullz/RFMC.git';
const RFMS_COMMIT = '810fc9652da431eaf8978b85bf4af131605559b5';

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function rfmsIsGitRepo() {
  return existsSync(resolve(RFMS_DIR, '.git'));
}

function rfmsHead() {
  if (!rfmsIsGitRepo()) return null;
  const result = runGit(['-C', RFMS_DIR, 'rev-parse', 'HEAD'], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function rfmsStatus() {
  if (!rfmsIsGitRepo()) return '';
  const result = runGit(['-C', RFMS_DIR, 'status', '--porcelain'], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

function assertSharedPackage() {
  if (!existsSync(RFMS_SHARED_PACKAGE)) {
    throw new Error(
      `RFMS shared package is missing at ${RFMS_SHARED_PACKAGE}. Run \`npm run bootstrap\` from the RFS root.`,
    );
  }
}

function checkOnly() {
  assertSharedPackage();
  const head = rfmsHead();
  if (head && head !== RFMS_COMMIT) {
    process.stderr.write(
      `RFMS shared package is available, but the sibling checkout is at ${head}, not the pinned CI/Docker commit ${RFMS_COMMIT}.\n`,
    );
  }
  process.stdout.write(`RFMS shared dependency available at ${RFMS_SHARED_PACKAGE}\n`);
}

function ensureBootstrapTarget() {
  if (!existsSync(RFMS_DIR)) {
    mkdirSync(RFMS_DIR, { recursive: true });
  } else if (!rfmsIsGitRepo() && readdirSync(RFMS_DIR).length > 0) {
    throw new Error(`${RFMS_DIR} exists but is not a git repository; refusing to modify it.`);
  }

  if (!rfmsIsGitRepo()) {
    runGit(['init', RFMS_DIR]);
  }

  const remote = runGit(['-C', RFMS_DIR, 'remote', 'get-url', 'origin'], { allowFailure: true });
  if (remote.status === 0) {
    runGit(['-C', RFMS_DIR, 'remote', 'set-url', 'origin', RFMS_REPO_URL]);
  } else {
    runGit(['-C', RFMS_DIR, 'remote', 'add', 'origin', RFMS_REPO_URL]);
  }
}

function bootstrap() {
  ensureBootstrapTarget();
  const head = rfmsHead();
  const status = rfmsStatus();
  if (status.length > 0) {
    throw new Error(
      `RFMS checkout at ${RFMS_DIR} has local changes; refusing to use or switch commits. ` +
        `Clean that checkout or run with an empty/missing ../RFMS directory.`,
    );
  }
  if (head === RFMS_COMMIT && existsSync(RFMS_SHARED_PACKAGE)) {
    process.stdout.write(`RFMS already at pinned commit ${RFMS_COMMIT}\n`);
    return;
  }

  runGit(['-C', RFMS_DIR, 'fetch', '--depth', '1', 'origin', RFMS_COMMIT]);
  runGit(['-C', RFMS_DIR, 'checkout', '--detach', 'FETCH_HEAD']);
  checkOnly();
}

try {
  if (process.argv.includes('--check')) {
    checkOnly();
  } else {
    bootstrap();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
