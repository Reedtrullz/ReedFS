#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, env, stdout } from "node:process";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const metadata = {
  name: packageJson.name,
  version: env.RFS_VERSION || packageJson.version,
  commit: env.RFS_COMMIT_SHA || env.GITHUB_SHA || "unknown",
  imageRef: env.RFS_IMAGE_REF || "unknown",
  imageDigest: env.RFS_IMAGE_DIGEST || "unknown",
};

const outputPath = resolve(root, argv[2] ?? "dist/rfs-version.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
stdout.write(`wrote ${outputPath}\n`);
