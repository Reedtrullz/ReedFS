#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { exit, stderr as processStderr, stdout as processStdout } from "node:process";

function pnpmLsThree() {
  try {
    return execFileSync("pnpm", ["ls", "three", "--json", "--depth", "Infinity"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stdout = error?.stdout?.toString() ?? "";
    if (stdout.trim()) {
      return stdout;
    }

    const stderr = error?.stderr?.toString() ?? "";
    if (stderr.trim()) {
      processStderr.write(stderr);
    }
    exit(error?.status ?? 1);
  }
}

function parseTree(json) {
  try {
    return JSON.parse(json);
  } catch (error) {
    processStderr.write("failed to parse pnpm ls three JSON output\n");
    processStderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    exit(1);
  }
}

function collectThreeVersions(node, dependencyKey, versions) {
  if (!node || typeof node !== "object") {
    return;
  }

  const nodeName = typeof node.name === "string" ? node.name : undefined;
  const isThree = dependencyKey === "three" || nodeName === "three";

  if (isThree) {
    if (typeof node.version === "string" && node.version.length > 0) {
      versions.add(node.version);
    } else {
      versions.add("(unknown version)");
    }
  }

  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const dependencies = node[field];
    if (!dependencies || typeof dependencies !== "object") {
      continue;
    }
    for (const [childKey, childNode] of Object.entries(dependencies)) {
      collectThreeVersions(childNode, childKey, versions);
    }
  }
}

// `pnpm ls --json` returns one entry per project (a single one here).
const parsed = parseTree(pnpmLsThree());
const projects = Array.isArray(parsed) ? parsed : [parsed];
const versions = new Set();
for (const project of projects) {
  collectThreeVersions(project, project?.name, versions);
}

const installedVersions = [...versions].sort();
if (installedVersions.length === 1 && installedVersions[0] !== "(unknown version)") {
  processStdout.write(`single three version: ${installedVersions[0]}\n`);
  exit(0);
}

processStderr.write(
  `expected exactly one installed three version, found ${installedVersions.length}: ${
    installedVersions.length > 0 ? installedVersions.join(", ") : "(none)"
  }\n`,
);
exit(1);
