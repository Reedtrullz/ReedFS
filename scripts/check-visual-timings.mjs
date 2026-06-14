#!/usr/bin/env node
/* global console */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const artifactPath = path.resolve(root, process.env.RFS_VISUAL_TIMINGS_FILE ?? 'test-results/visual-timings.json');
const configPath = path.resolve(root, 'playwright.config.ts');
const maxTestDurationMs = Number(process.env.RFS_VISUAL_MAX_TEST_MS ?? 80_000);
const maxTotalDurationMs = Number(process.env.RFS_VISUAL_MAX_TOTAL_MS ?? 480_000);
const maxArtifactAgeMs = Number(process.env.RFS_VISUAL_MAX_ARTIFACT_AGE_MS ?? 10 * 60_000);

function fail(message) {
  console.error(`visual timing budget failed: ${message}`);
  process.exit(1);
}

if (!existsSync(artifactPath)) {
  fail(`missing Playwright JSON timing artifact at ${path.relative(root, artifactPath)}`);
}

const artifactAgeMs = Date.now() - statSync(artifactPath).mtimeMs;
if (artifactAgeMs > maxArtifactAgeMs) {
  fail(`stale timing artifact ${path.relative(root, artifactPath)} is ${Math.round(artifactAgeMs / 1000)}s old`);
}

if (!existsSync(configPath)) {
  fail('missing playwright.config.ts');
}

const configSource = readFileSync(configPath, 'utf8');
if (!/retries:\s*process\.env\.CI\s*\?\s*1\s*:\s*0/.test(configSource)) {
  fail('Playwright config must enable exactly one CI retry for first-retry traces');
}
if (!/trace:\s*['"]on-first-retry['"]/.test(configSource)) {
  fail('Playwright config must collect trace: on-first-retry');
}

let report;
try {
  report = JSON.parse(readFileSync(artifactPath, 'utf8'));
} catch (error) {
  fail(`could not parse timing artifact JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const testDurations = [];
function visitSuite(suite, parents = []) {
  const suiteTitle = suite.title ? [...parents, suite.title] : parents;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      for (const [index, result] of (test.results ?? []).entries()) {
        if (result.status === 'skipped') continue;
        testDurations.push({
          title: [...suiteTitle, spec.title, test.projectName ?? '', `run ${index + 1}`].filter(Boolean).join(' › '),
          duration: result.duration ?? 0,
          status: result.status,
        });
      }
    }
  }
  for (const child of suite.suites ?? []) visitSuite(child, suiteTitle);
}
for (const suite of report.suites ?? []) visitSuite(suite);

if (testDurations.length === 0) {
  fail('timing artifact did not contain any executed tests');
}

const totalDurationMs = testDurations.reduce((sum, test) => sum + test.duration, 0);
const slowTests = testDurations.filter((test) => test.duration > maxTestDurationMs);
if (slowTests.length > 0) {
  fail(`tests exceeded ${maxTestDurationMs}ms budget:\n${slowTests.map((test) => `- ${test.duration}ms ${test.title}`).join('\n')}`);
}
if (totalDurationMs > maxTotalDurationMs) {
  fail(`total executed test duration ${totalDurationMs}ms exceeds ${maxTotalDurationMs}ms budget`);
}

console.log(`visual timing budget ok: ${testDurations.length} executed results, total ${totalDurationMs}ms, max ${Math.max(...testDurations.map((test) => test.duration))}ms`);
