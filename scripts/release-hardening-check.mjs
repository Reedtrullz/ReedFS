#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exit, stderr, stdout } from "node:process";

const root = resolve(import.meta.dirname, "..");
const failures = [];

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const ci = read(".github/workflows/ci.yml");
const dockerfile = read("Dockerfile");
const nginx = read("nginx.conf");
const packageJson = JSON.parse(read("package.json"));
const ansibleCfg = read("ansible.cfg");
const inventory = read("inventory/hosts.yml");
const playbook = read("ansible-playbook.yml");

check(!/Cross-Origin-Opener-Policy|Cross-Origin-Embedder-Policy/.test(nginx), "nginx.conf must not set COOP/COEP headers");

for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (name.startsWith("test:visual")) {
    check(!command.includes("--pass-with-no-tests"), `${name} must not use --pass-with-no-tests`);
  }
}

const requiredActions = [
  ["actions/checkout", "df4cb1c069e1874edd31b4311f1884172cec0e10"],
  ["actions/setup-node", "48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e"],
  ["docker/login-action", "650006c6eb7dba73a995cc03b0b2d7f5ca915bee"],
  ["docker/build-push-action", "f9f3042f7e2789586610d6e8b85c8f03e5195baf"],
  ["appleboy/ssh-action", "0ff4204d59e8e51228ff73bce53f80d53301dee2"],
  ["gitleaks/gitleaks-action", "e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e"],
];
for (const [action, sha] of requiredActions) {
  check(ci.includes(`uses: ${action}@${sha}`), `workflow must pin ${action} to ${sha}`);
}

check(/^permissions:\n\s+contents: read/m.test(ci), "workflow must define least-privilege top-level permissions");
check(ci.includes("security-events: write"), "gitleaks job must have security-events write permission");
check(ci.includes("pull-requests: read"), "gitleaks job must have pull-requests read permission for pull_request runs");
check(ci.includes("810fc9652da431eaf8978b85bf4af131605559b5"), "workflow must pin RFMS/RFMC checkout to the audited commit");
check((ci.match(/npm ci --legacy-peer-deps/g) ?? []).length >= 2, "workflow must use npm ci --legacy-peer-deps");
check(ci.includes("ghcr.io/reedtrullz/rfs:latest") && ci.includes("ghcr.io/reedtrullz/rfs:sha-${{ github.sha }}"), "workflow must push latest and sha-${{ github.sha }} tags");
check(ci.includes("IMAGE_REF=ghcr.io/reedtrullz/rfs:sha-${{ github.sha }}"), "deploy must use the immutable sha image ref");
check(!/docker run[\s\S]*ghcr\.io\/reedtrullz\/rfs:latest/.test(ci), "deploy must not run mutable latest");
check(ci.includes("curl -fsS https://fly.reidar.tech/"), "workflow must verify the public domain after promotion");
check(ci.includes("https://fly.reidar.tech/rfs-version.json"), "workflow must verify public version metadata");
check(ci.includes("org.opencontainers.image.revision"), "workflow Docker build must include OCI labels");
check(ci.includes("PREVIOUS_IMAGE_ID=\"$(docker inspect -f '{{.Image}}' rfs") && ci.includes("PREVIOUS_IMAGE_REF=\"$(docker inspect -f '{{.Config.Image}}' rfs"), "deploy rollback must capture previous image ID and Config.Image fallback");
check(ci.includes('docker logs --tail=50 rfs_canary') && ci.includes('docker rm -f rfs_canary'), "deploy canary failures must print logs and clean up the canary container");

check(dockerfile.includes("node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920"), "Dockerfile must pin node:22-alpine by digest");
check(dockerfile.includes("nginx:alpine@sha256:8b1e78743a03dbb2c95171cc58639fef29abc8816598e27fb910ed2e621e589a"), "Dockerfile must pin nginx:alpine by digest");
check(dockerfile.includes("810fc9652da431eaf8978b85bf4af131605559b5"), "Dockerfile must checkout the audited RFMS/RFMC commit");
check(dockerfile.includes("npm ci --legacy-peer-deps"), "Dockerfile must use npm ci --legacy-peer-deps");
check(dockerfile.includes("RFS_COMMIT_SHA") && dockerfile.includes("RFS_IMAGE_REF"), "Dockerfile must pass release metadata into the build");

check(!/host_key_checking\s*=\s*false/i.test(ansibleCfg), "ansible.cfg must not disable host key checking");
check(/host_key_checking\s*=\s*true/i.test(ansibleCfg), "ansible.cfg should explicitly enable host key checking");
check(ansibleCfg.includes("UserKnownHostsFile=inventory/known_hosts") || inventory.includes("UserKnownHostsFile=inventory/known_hosts"), "Ansible SSH config must use inventory/known_hosts");
check(inventory.includes("StrictHostKeyChecking=yes") || ansibleCfg.includes("StrictHostKeyChecking=yes"), "Ansible SSH config must enforce StrictHostKeyChecking=yes");
check(existsSync(resolve(root, "inventory/known_hosts")), "inventory/known_hosts must exist");
check(read("inventory/known_hosts").includes("198.23.137.16 ssh-ed25519"), "inventory/known_hosts must contain the VPS host key scan");
check(playbook.includes("image_ref") && playbook.includes("ghcr.io/reedtrullz/rfs:sha-"), "Ansible deploy must accept/use an immutable image_ref");
check(playbook.includes("https://{{ public_domain }}/") && playbook.includes("rfs-version.json"), "Ansible deploy must verify public domain and version metadata");
check(playbook.includes("previous_image") && playbook.includes("Rollback"), "Ansible deploy must include a rollback path");
check(playbook.includes("existing_prod.container.Image | default(existing_prod.container.Config.Image"), "Ansible rollback must prefer the previous image ID over Config.Image");

check(existsSync(resolve(root, "scripts/write-version-metadata.mjs")), "release metadata generator script must exist");
check(packageJson.scripts?.build === "tsc -b && vite build && node scripts/write-version-metadata.mjs dist/rfs-version.json", "build must write release metadata into dist after Vite build");
check(read("scripts/write-version-metadata.mjs").includes('argv[2] ?? "dist/rfs-version.json"'), "release metadata generator must default to dist/rfs-version.json and accept an output path argument");
check(!existsSync(resolve(root, "public/rfs-version.json")), "public/rfs-version.json must not be tracked or generated in the source tree");

if (failures.length > 0) {
  stderr.write("release hardening checks failed:\n");
  for (const failure of failures) stderr.write(`- ${failure}\n`);
  exit(1);
}

stdout.write("release hardening checks passed\n");
