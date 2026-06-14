#!/usr/bin/env node
import process from 'node:process';
import { error as logError, log as logInfo } from 'node:console';
import { gzipSync } from 'node:zlib';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const DIST_DIR = fileURLToPath(new URL('../dist/assets/', import.meta.url));

const BUDGETS = {
  // Current baseline after Task 39: app raw 278.9 KiB / gzip 90.0 KiB.
  app: { rawBytes: 325 * 1024, gzipBytes: 105 * 1024, required: true },
  // React/Zustand framework chunk baseline: raw 182.4 KiB / gzip 56.7 KiB.
  vendorReact: { rawBytes: 205 * 1024, gzipBytes: 65 * 1024, required: true },
  // Generic vendor chunk baseline: raw 3.5 KiB / gzip 1.5 KiB.
  vendor: { rawBytes: 8 * 1024, gzipBytes: 4 * 1024, required: false },
  // Three.js is intentionally isolated; baseline raw 500.6 KiB / gzip 124.9 KiB.
  three: { rawBytes: 550 * 1024, gzipBytes: 140 * 1024, required: true },
  // three-to-cesium bridge baseline: raw 2.8 KiB / gzip 1.1 KiB.
  threeBridge: { rawBytes: 8 * 1024, gzipBytes: 4 * 1024, required: true },
  // Cesium policy/lifecycle/CSS baseline: raw 24.8 KiB / gzip 6.1 KiB.
  cesium: { rawBytes: 64 * 1024, gzipBytes: 16 * 1024, required: false },
};

function categoryForAsset(fileName) {
  if (!/\.(js|css)$/.test(fileName)) return null;
  if (fileName.startsWith('vendor-react-')) return 'vendorReact';
  if (fileName.startsWith('vendor-')) return 'vendor';
  if (fileName.startsWith('three-bridge-')) return 'threeBridge';
  if (fileName.startsWith('three-')) return 'three';
  if (fileName.startsWith('cesium') || fileName.includes('Cesium')) return 'cesium';
  return 'app';
}

function emptyUsage() {
  return Object.fromEntries(Object.keys(BUDGETS).map((category) => [category, {
    rawBytes: 0,
    gzipBytes: 0,
    files: [],
  }]));
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function collectUsage() {
  try {
    const dirPath = DIST_DIR;
    const usage = emptyUsage();
    for (const fileName of readdirSync(dirPath)) {
      const category = categoryForAsset(fileName);
      if (!category) continue;
      const filePath = join(dirPath, fileName);
      const stat = statSync(filePath);
      if (!stat.isFile()) continue;
      const content = readFileSync(filePath);
      const rawBytes = content.byteLength;
      const gzipBytes = gzipSync(content).byteLength;
      usage[category].rawBytes += rawBytes;
      usage[category].gzipBytes += gzipBytes;
      usage[category].files.push(fileName);
    }
    return usage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to inspect dist/assets. Run npm run build first. ${message}`, { cause: error });
  }
}

async function main() {
  const usage = collectUsage();
  const failures = [];
  for (const [category, budget] of Object.entries(BUDGETS)) {
    const actual = usage[category];
    if (budget.required && actual.files.length === 0) {
      failures.push(`${category}: required asset category was not emitted`);
      continue;
    }
    if (actual.rawBytes > budget.rawBytes) {
      failures.push(`${category}: raw ${formatBytes(actual.rawBytes)} exceeds budget ${formatBytes(budget.rawBytes)} (${actual.files.join(', ') || 'no files'})`);
    }
    if (actual.gzipBytes > budget.gzipBytes) {
      failures.push(`${category}: gzip ${formatBytes(actual.gzipBytes)} exceeds budget ${formatBytes(budget.gzipBytes)} (${actual.files.join(', ') || 'no files'})`);
    }
  }

  const summary = Object.entries(usage)
    .map(([category, actual]) => `${category}: raw=${formatBytes(actual.rawBytes)} gzip=${formatBytes(actual.gzipBytes)} files=${actual.files.length}`)
    .join('\n');

  if (failures.length > 0) {
    logError(`Bundle budget check failed:\n${failures.join('\n')}\n\nCurrent bundle usage:\n${summary}`);
    process.exit(1);
  }

  logInfo(`bundle budgets ok\n${summary}`);
}

await main();
