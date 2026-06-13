#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realRepoRoot = fs.realpathSync(repoRoot);
const entrypoint = path.join(repoRoot, 'e2e/rfs-blackbox-player-loop.spec.ts');
const allowedExternalImports = new Set(['@playwright/test']);
const importLikePattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const forbiddenPatterns = [
  { label: 'Zustand sim store access', pattern: /\buseSimStore\b/ },
  { label: 'direct store state mutation', pattern: /(?:^|[^\w$])\.?setState\s*\(/ },
  { label: 'sim store module path', pattern: /(?:^|[./])src\/store\/simStore(?:\.ts)?\b/ },
  { label: 'direct src import path', pattern: /(?:^|['"`])(?:\.\.\/)+src\// },
  { label: 'absolute src path', pattern: /\/src\// },
  { label: 'direct aircraft object seeding', pattern: /\baircraft\s*:\s*\{/ },
  { label: 'direct flight plan object seeding', pattern: /\bflightPlan\s*:\s*\{/ },
  { label: 'page.evaluate use', pattern: /\bpage\.evaluate\s*\(/ },
];

const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const invalidResolvedImport = Symbol('invalid resolved import');
const visited = new Set();
const failures = [];

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function isWithinDirectory(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertNotSymlink(filePath, fromFile, specifier) {
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink()) {
    failures.push(`${toRepoPath(fromFile)} imports ${specifier}, which resolves to symlink ${toRepoPath(filePath)}`);
    return false;
  }
  return true;
}

function assertRepoLocalRealPath(filePath, fromFile, specifier) {
  const realPath = fs.realpathSync(filePath);
  if (!isWithinDirectory(realPath, realRepoRoot)) {
    failures.push(`${toRepoPath(fromFile)} imports ${specifier}, whose real path resolves outside the repository`);
    return false;
  }
  return true;
}

function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const extension of extensions) {
    const candidate = base + extension;
    if (!fs.existsSync(candidate)) continue;
    if (!assertNotSymlink(candidate, fromFile, specifier)) return invalidResolvedImport;
    if (!assertRepoLocalRealPath(candidate, fromFile, specifier)) return invalidResolvedImport;
    if (fs.statSync(candidate).isFile()) return candidate;
  }

  for (const extension of extensions.slice(1)) {
    const candidate = path.join(base, `index${extension}`);
    if (!fs.existsSync(candidate)) continue;
    if (!assertNotSymlink(candidate, fromFile, specifier)) return invalidResolvedImport;
    if (!assertRepoLocalRealPath(candidate, fromFile, specifier)) return invalidResolvedImport;
    if (fs.statSync(candidate).isFile()) return candidate;
  }

  return null;
}

function assertRepoLocal(filePath, fromFile, specifier) {
  const relative = path.relative(repoRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    failures.push(`${toRepoPath(fromFile)} imports ${specifier}, which resolves outside the repository`);
    return false;
  }
  if (!assertRepoLocalRealPath(filePath, fromFile, specifier)) return false;
  return true;
}

function assertE2eLocal(filePath, fromFile, specifier) {
  const repoPath = toRepoPath(filePath);
  if (!repoPath.startsWith('e2e/')) {
    failures.push(`${toRepoPath(fromFile)} imports ${specifier}, which resolves outside e2e/ black-box helpers`);
    return false;
  }
  return true;
}

function scanFile(filePath) {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  if (!fs.existsSync(filePath)) {
    failures.push(`${toRepoPath(filePath)} does not exist`);
    return;
  }

  if (!assertNotSymlink(filePath, entrypoint, toRepoPath(filePath))) return;
  if (!assertRepoLocal(filePath, entrypoint, toRepoPath(filePath))) return;

  const source = fs.readFileSync(filePath, 'utf8');
  const repoPath = toRepoPath(filePath);

  for (const { label, pattern } of forbiddenPatterns) {
    const match = pattern.exec(source);
    pattern.lastIndex = 0;
    if (match) {
      const line = source.slice(0, match.index).split('\n').length;
      failures.push(`${repoPath}:${line} contains forbidden ${label}`);
    }
  }

  importLikePattern.lastIndex = 0;
  for (const match of source.matchAll(importLikePattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;

    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const resolved = resolveRelativeImport(filePath, specifier);
      if (resolved === invalidResolvedImport) continue;
      if (!resolved) {
        failures.push(`${repoPath} imports ${specifier}, but the target could not be resolved deterministically`);
        continue;
      }
      if (!assertRepoLocal(resolved, filePath, specifier)) continue;
      if (!assertE2eLocal(resolved, filePath, specifier)) continue;
      scanFile(resolved);
      continue;
    }

    if (!allowedExternalImports.has(specifier)) {
      failures.push(`${repoPath} imports non-black-box module ${specifier}`);
    }
  }
}

scanFile(entrypoint);

if (failures.length > 0) {
  console.error('Black-box E2E guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Black-box E2E guard passed (${visited.size} file${visited.size === 1 ? '' : 's'} scanned).`);
