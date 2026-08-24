#!/usr/bin/env node
/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifest = 'e2e/blackbox-manifest.json';
let repoRoot = defaultRepoRoot;
let realRepoRoot = null;
let realE2eRoot = null;
const allowedExternalImports = new Set(['@playwright/test']);
const jsTrivia = String.raw`(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n\r]*(?:\r?\n|$))*`;
const importLikePattern = new RegExp(
  String.raw`(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import${jsTrivia}\(${jsTrivia}['"]([^'"]+)['"]${jsTrivia}\)`,
  'g',
);
const fullFlightEntrypoint = 'e2e/rfs-full-flight-blackbox.spec.ts';
const fullFlightFinalResetMarker = 'Final reset section: continuous ENVA-to-ENGM proof already reached STOPPED.';
const fullFlightAllowedScenarioCall = 'selectEnvaScenarioThroughVisibleControls';

const forbiddenPatterns = [
  { label: 'Zustand sim store access', pattern: /\buseSimStore\b/ },
  { label: 'direct store state mutation', pattern: /(?:^|[^\w$])\.?setState\s*\(/ },
  { label: 'sim store module path', pattern: /(?:^|[./])src\/store\/simStore(?:\.ts)?\b/ },
  { label: 'direct src import path', pattern: /(?:^|['"`])(?:\.\.\/)+src\// },
  { label: 'absolute src path', pattern: /\/src\// },
  { label: 'direct aircraft object seeding', pattern: /\baircraft\s*:\s*\{/ },
  { label: 'direct flight plan object seeding', pattern: /\bflightPlan\s*:\s*\{/ },
  { label: 'page.evaluate use', pattern: /\bpage\.evaluate\s*\(/ },
  { label: 'non-literal dynamic import', pattern: new RegExp(String.raw`\bimport${jsTrivia}\(${jsTrivia}(?!['"])`) },
  { label: 'CommonJS require', pattern: new RegExp(String.raw`\brequire${jsTrivia}\(`) },
];

const fullFlightForbiddenPatterns = [
  { label: 'KPDX short-final scenario helper', pattern: /\bselectKpdxShortFinalScenarioThroughVisibleControls\b/ },
  { label: 'KPDX short-final scenario id', pattern: /kpdx-10r-short-final/i },
  { label: 'KPDX short-final visible scenario', pattern: /KPDX\s+10R\s+Short\s+Final|KPDX\s+short-final/i },
  { label: 'split KSEA climb scenario helper', pattern: /\bselectKseaScenarioThroughVisibleControls\b/ },
  { label: 'direct scenario selectOption in full-flight proof', pattern: /\.selectOption\s*\(/ },
];

const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const invalidResolvedImport = Symbol('invalid resolved import');
const visited = new Set();
const failures = [];

function parseCliArgs(argv) {
  const options = {
    repoRoot: defaultRepoRoot,
    manifest: defaultManifest,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo-root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--repo-root requires a path');
      options.repoRoot = value;
      index += 1;
      continue;
    }
    if (arg === '--manifest') {
      const value = argv[index + 1];
      if (!value) throw new Error('--manifest requires a path');
      options.manifest = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function isWithinDirectory(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveManifestPath(manifest) {
  return path.isAbsolute(manifest) ? path.resolve(manifest) : path.resolve(repoRoot, manifest);
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    failures.push(`${toRepoPath(manifestPath)} does not exist`);
    return [];
  }

  if (!assertNotSymlink(manifestPath, manifestPath, toRepoPath(manifestPath))) return [];
  if (!assertRepoLocalRealPath(manifestPath, manifestPath, toRepoPath(manifestPath))) return [];

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    failures.push(`${toRepoPath(manifestPath)} could not be parsed as JSON: ${error.message}`);
    return [];
  }

  if (!manifest || !Array.isArray(manifest.entrypoints)) {
    failures.push(`${toRepoPath(manifestPath)} must contain an entrypoints array`);
    return [];
  }
  if (manifest.entrypoints.length === 0) {
    failures.push(`${toRepoPath(manifestPath)} must list at least one entrypoint`);
    return [];
  }

  return manifest.entrypoints.flatMap((entrypoint) => {
    if (typeof entrypoint !== 'string' || entrypoint.trim() === '') {
      failures.push(`${toRepoPath(manifestPath)} contains a non-string or empty entrypoint`);
      return [];
    }
    if (path.isAbsolute(entrypoint)) {
      failures.push(`${toRepoPath(manifestPath)} entrypoint ${entrypoint} must be relative to the repository root`);
      return [];
    }

    const absolutePath = path.resolve(repoRoot, entrypoint);
    const repoPath = toRepoPath(absolutePath);
    if (repoPath.startsWith('..') || path.isAbsolute(repoPath)) {
      failures.push(`${toRepoPath(manifestPath)} entrypoint ${entrypoint} resolves outside the repository`);
      return [];
    }
    if (realE2eRoot && !repoPath.startsWith('e2e/')) {
      failures.push(`${toRepoPath(manifestPath)} entrypoint ${entrypoint} is outside e2e/ black-box specs`);
      return [];
    }

    return [{ manifestPath: entrypoint, absolutePath }];
  });
}

function loadConfig(argv) {
  const options = parseCliArgs(argv);
  repoRoot = path.resolve(options.repoRoot);
  if (!fs.existsSync(repoRoot)) throw new Error(`${repoRoot} does not exist`);
  realRepoRoot = fs.realpathSync(repoRoot);

  const e2eRoot = path.join(repoRoot, 'e2e');
  realE2eRoot = fs.existsSync(e2eRoot) ? fs.realpathSync(e2eRoot) : null;

  const manifestPath = resolveManifestPath(options.manifest);
  const manifestRepoPath = toRepoPath(manifestPath);
  if (manifestRepoPath.startsWith('..') || path.isAbsolute(manifestRepoPath)) {
    failures.push(`${options.manifest} resolves outside the repository`);
    return [];
  }

  return readManifest(manifestPath);
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

function assertBlackboxRealPath(filePath, fromFile, specifier) {
  if (!realE2eRoot) return true;

  const realPath = fs.realpathSync(filePath);
  if (!isWithinDirectory(realPath, realE2eRoot)) {
    failures.push(`${toRepoPath(fromFile)} imports ${specifier}, whose real path resolves outside e2e/ black-box surface`);
    return false;
  }

  return true;
}

function assertBlackboxImportSurface(filePath, fromFile, specifier) {
  if (!realE2eRoot) return true;

  const repoPath = toRepoPath(filePath);
  if (!repoPath.startsWith('e2e/')) {
    failures.push(`${toRepoPath(fromFile)} imports ${specifier}, which resolves outside e2e/ black-box helpers`);
    return false;
  }

  return assertBlackboxRealPath(filePath, fromFile, specifier);
}

function lineNumberForIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}

function findPatternIndex(source, pattern) {
  const match = pattern.exec(source);
  pattern.lastIndex = 0;
  return match ? match.index : -1;
}

function assertFullFlightEntrypointRules(repoPath, source) {
  if (repoPath !== fullFlightEntrypoint) return;

  for (const { label, pattern } of fullFlightForbiddenPatterns) {
    const match = pattern.exec(source);
    pattern.lastIndex = 0;
    if (match) {
      failures.push(`${repoPath}:${lineNumberForIndex(source, match.index)} contains forbidden ${label}`);
    }
  }

  const scenarioCalls = [...source.matchAll(/\bselect[A-Za-z0-9]*ScenarioThroughVisibleControls\s*\(/g)]
    .map((match) => ({ name: match[0].replace(/\s*\($/, ''), index: match.index ?? 0 }));
  if (scenarioCalls.length !== 1 || scenarioCalls[0]?.name !== fullFlightAllowedScenarioCall) {
    const details = scenarioCalls.length > 0
      ? scenarioCalls.map((call) => `${call.name}@${lineNumberForIndex(source, call.index)}`).join(', ')
      : 'none';
    failures.push(`${repoPath} must select only ENVA once before the continuous proof; found ${details}`);
  }

  const resetMatches = [...source.matchAll(/\bresetThroughVisibleControls\s*\(/g)]
    .map((match) => ({ index: match.index ?? 0 }));
  if (resetMatches.length !== 1) {
    failures.push(`${repoPath} must call resetThroughVisibleControls exactly once in the final reset section; found ${resetMatches.length}`);
  }

  const markerIndex = source.indexOf(fullFlightFinalResetMarker);
  if (markerIndex === -1) {
    failures.push(`${repoPath} must mark its final reset section with "${fullFlightFinalResetMarker}"`);
  }

  const stoppedAssertionIndex = findPatternIndex(
    source,
    /expect\s*\(\s*await\s+readVisibleFlightPhase\s*\(\s*page\s*\)\s*\)\.toBe\s*\(\s*['"]STOPPED['"]\s*\)/,
  );
  if (stoppedAssertionIndex === -1) {
    failures.push(`${repoPath} must visibly assert STOPPED before the final reset section`);
  }

  if (markerIndex !== -1 && stoppedAssertionIndex !== -1 && markerIndex < stoppedAssertionIndex) {
    failures.push(`${repoPath} places the final reset section before the visible STOPPED assertion`);
  }

  for (const resetMatch of resetMatches) {
    if (markerIndex === -1 || resetMatch.index < markerIndex) {
      failures.push(`${repoPath}:${lineNumberForIndex(source, resetMatch.index)} calls resetThroughVisibleControls before the final reset section`);
    }
  }
}

function scanFile(filePath, entrypoint) {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  if (!fs.existsSync(filePath)) {
    failures.push(`${toRepoPath(filePath)} does not exist`);
    return;
  }

  if (!assertNotSymlink(filePath, entrypoint, toRepoPath(filePath))) return;
  if (!assertRepoLocal(filePath, entrypoint, toRepoPath(filePath))) return;
  if (!assertBlackboxRealPath(filePath, entrypoint, toRepoPath(filePath))) return;

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

  assertFullFlightEntrypointRules(repoPath, source);

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
      if (!assertBlackboxImportSurface(resolved, filePath, specifier)) continue;
      scanFile(resolved, entrypoint);
      continue;
    }

    if (!allowedExternalImports.has(specifier)) {
      failures.push(`${repoPath} imports non-black-box module ${specifier}`);
    }
  }
}

function printFailuresAndExit() {
  console.error('Black-box E2E guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(`Black-box E2E guard visited ${visited.size} file${visited.size === 1 ? '' : 's'}.`);
  process.exit(1);
}

let entrypoints = [];
try {
  entrypoints = loadConfig(process.argv.slice(2));
} catch (error) {
  failures.push(error.message);
}

for (const entrypoint of entrypoints) {
  console.log(`Black-box E2E guard scanning entrypoint: ${entrypoint.manifestPath}`);
  scanFile(entrypoint.absolutePath, entrypoint.absolutePath);
}

if (failures.length > 0) printFailuresAndExit();

console.log(
  `Black-box E2E guard passed (${visited.size} file${visited.size === 1 ? '' : 's'} scanned across ${entrypoints.length} entrypoint${entrypoints.length === 1 ? '' : 's'}).`,
);
