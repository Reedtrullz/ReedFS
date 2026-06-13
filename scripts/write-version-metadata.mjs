#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, env, exit, stderr, stdout } from "node:process";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const imageDigest = env.RFS_IMAGE_DIGEST || "unknown";
if (env.RFS_REQUIRE_IMAGE_DIGEST === "1" && !/^sha256:[a-f0-9]{64}$/i.test(imageDigest)) {
  stderr.write("RFS_REQUIRE_IMAGE_DIGEST=1 requires RFS_IMAGE_DIGEST to be a sha256:<64 hex> digest\n");
  exit(1);
}

const metadata = {
  name: packageJson.name,
  version: env.RFS_VERSION || packageJson.version,
  commit: env.RFS_COMMIT_SHA || env.GITHUB_SHA || "unknown",
  imageRef: env.RFS_IMAGE_REF || "unknown",
  imageDigest,
};

const outputPath = resolve(root, argv[2] ?? "dist/rfs-version.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
stdout.write(`wrote ${outputPath}\n`);
