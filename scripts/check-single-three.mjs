#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { exit, stderr as processStderr, stdout as processStdout } from "node:process";

function npmLsThree() {
  try {
    return execFileSync("npm", ["ls", "three", "--json", "--all"], {
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
    processStderr.write("failed to parse npm ls three JSON output\n");
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

  const dependencies = node.dependencies;
  if (!dependencies || typeof dependencies !== "object") {
    return;
  }

  for (const [childKey, childNode] of Object.entries(dependencies)) {
    collectThreeVersions(childNode, childKey, versions);
  }
}

const tree = parseTree(npmLsThree());
const versions = new Set();
collectThreeVersions(tree, tree?.name, versions);

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
