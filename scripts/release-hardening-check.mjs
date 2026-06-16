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

function dockerignoreHasLine(pattern) {
  return dockerignore.split(/\r?\n/).some((line) => line.trim() === pattern);
}

const ci = read(".github/workflows/ci.yml");
const codeql = read(".github/workflows/codeql.yml");
const dependabot = read(".github/dependabot.yml");
const dockerfile = read("Dockerfile");
const dockerignore = read(".dockerignore");
const bootstrapRfmsShared = read("scripts/bootstrap-rfms-shared.mjs");
const nginx = read("nginx.conf");
const packageJson = JSON.parse(read("package.json"));
const ansibleCfg = read("ansible.cfg");
const inventory = read("inventory/hosts.yml");
const playbook = read("ansible-playbook.yml");
const branchProtectionRunbook = read("docs/runbooks/branch-protection.md");
const releaseCloseoutRunbook = read("docs/runbooks/release-closeout.md");
const branchProtectionChecker = read("scripts/check-branch-protection.mjs");
const exactShaReleaseChecker = read("scripts/check-exact-sha-release.mjs");

check(!/Cross-Origin-Opener-Policy|Cross-Origin-Embedder-Policy/.test(nginx), "nginx.conf must not set COOP/COEP headers");

for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (name.startsWith("test:visual")) {
    check(!command.includes("--pass-with-no-tests"), `${name} must not use --pass-with-no-tests`);
  }
}
check(packageJson.scripts?.bootstrap === "node scripts/bootstrap-rfms-shared.mjs", "package.json must expose npm run bootstrap for RFMS shared setup");
check(packageJson.scripts?.["bootstrap:check"] === "node scripts/bootstrap-rfms-shared.mjs --check", "package.json must expose npm run bootstrap:check for RFMS shared verification");

const allWorkflowYaml = `${ci}\n${codeql}`;
const requiredActions = [
  ["actions/checkout", "df4cb1c069e1874edd31b4311f1884172cec0e10"],
  ["actions/setup-node", "48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e"],
  ["docker/login-action", "650006c6eb7dba73a995cc03b0b2d7f5ca915bee"],
  ["docker/build-push-action", "f9f3042f7e2789586610d6e8b85c8f03e5195baf"],
  ["appleboy/ssh-action", "0ff4204d59e8e51228ff73bce53f80d53301dee2"],
  ["gitleaks/gitleaks-action", "e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e"],
  ["github/codeql-action/init", "8aad20d150bbac5944a9f9d289da16a4b0d87c1e"],
  ["github/codeql-action/analyze", "8aad20d150bbac5944a9f9d289da16a4b0d87c1e"],
  ["aquasecurity/trivy-action", "ed142fd0673e97e23eac54620cfb913e5ce36c25"],
];
for (const [action, sha] of requiredActions) {
  check(allWorkflowYaml.includes(`uses: ${action}@${sha}`), `workflow must pin ${action} to ${sha}`);
}

check(/^permissions:\n\s+contents: read/m.test(ci), "workflow must define least-privilege top-level permissions");

for (const ecosystem of ["npm", "github-actions", "docker"]) {
  check(dependabot.includes(`package-ecosystem: ${ecosystem}`), `Dependabot must monitor ${ecosystem}`);
}
check((dependabot.match(/directory:\s*\//g) ?? []).length >= 3, "Dependabot npm/actions/docker updates must target the repository root");
check((dependabot.match(/interval:\s*weekly/g) ?? []).length >= 3, "Dependabot npm/actions/docker updates must run weekly");
check(
  /package-ecosystem:\s*docker[\s\S]*ignore:\s*-\s*dependency-name:\s*node[\s\S]*version-update:semver-major/.test(dependabot),
  "Dependabot Docker updates must ignore Node semver-major bumps; Node major upgrades require a dedicated LTS/toolchain migration plan"
);

check(codeql.includes("security-events: write"), "CodeQL workflow must have security-events write permission");
check(codeql.includes("languages: javascript-typescript"), "CodeQL workflow must analyze JavaScript/TypeScript");
check(codeql.includes("build-mode: none"), "CodeQL workflow must use no-build analysis for JS/TS");

check(ci.includes("aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25"), "docker-smoke job must run pinned Trivy image scan");
check(ci.includes("image-ref: rfs:pr-smoke-${{ github.sha }}"), "Trivy scan must inspect the PR-safe smoke image");
check(ci.includes("severity: HIGH,CRITICAL") && ci.includes("exit-code: '1'"), "Trivy scan must fail on HIGH/CRITICAL vulnerabilities");

check(/concurrency:\n\s+group:\s+\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n\s+cancel-in-progress:\s+false/m.test(ci), "workflow must serialize runs per workflow/ref with cancel-in-progress: false so VPS deploys cannot overlap");
check(ci.includes("security-events: write"), "gitleaks job must have security-events write permission");
check(ci.includes("pull-requests: read"), "gitleaks job must have pull-requests read permission for pull_request runs");
check(ci.includes("node scripts/bootstrap-rfms-shared.mjs") && bootstrapRfmsShared.includes("810fc9652da431eaf8978b85bf4af131605559b5"), "workflow must bootstrap RFMS/RFMC from the audited commit");
check((ci.match(/npm ci --legacy-peer-deps/g) ?? []).length >= 2, "workflow must use npm ci --legacy-peer-deps");
check(ci.includes("npm run check:deps"), "workflow test job must run npm run check:deps before build/test");
check(ci.includes("push: false"), "workflow must include a PR-safe Docker smoke build with push: false");
check(ci.includes("load: true"), "workflow must load the PR Docker smoke image into the local daemon");
check(ci.includes("curl -fsS http://localhost:3005/") && ci.includes("curl -fsS http://localhost:3005/rfs-version.json"), "workflow PR Docker smoke must curl / and /rfs-version.json");
check(ci.includes("ghcr.io/reedtrullz/rfs:latest") && ci.includes("ghcr.io/reedtrullz/rfs:sha-${{ github.sha }}"), "workflow must push latest and sha-${{ github.sha }} tags");
check(ci.includes("VITE_CESIUM_ION_TOKEN=${{ secrets.VITE_CESIUM_ION_TOKEN }}"), "workflow Docker build must pass the VITE_CESIUM_ION_TOKEN repo secret as a build arg");
check(ci.includes("IMAGE_REF=ghcr.io/reedtrullz/rfs:sha-${{ github.sha }}"), "deploy must use the immutable sha image ref");
check(!/docker run[^\n]*ghcr\.io\/reedtrullz\/rfs:latest/.test(ci), "deploy must not run mutable latest");
check(ci.includes("curl -fsS https://fly.reidar.tech/"), "workflow must verify the public domain after promotion");
check(ci.includes("https://fly.reidar.tech/rfs-version.json"), "workflow must verify public version metadata");
check(ci.includes("org.opencontainers.image.revision"), "workflow Docker build must include OCI labels");
check(ci.includes("EXPECTED_IMAGE_DIGEST=${{ needs.publish.outputs.image_digest }}"), "deploy must source expected image digest from the publish job output");
check(ci.includes("VERSION_METADATA_PATH") && ci.includes('"imageDigest": "$EXPECTED_IMAGE_DIGEST"'), "deploy must write post-push release metadata containing the immutable image digest");
check(ci.includes('-v "$VERSION_METADATA_PATH:/usr/share/nginx/html/rfs-version.json:ro"'), "deploy must mount post-push release metadata into canary and production containers");
check(ci.includes('grep -F "$EXPECTED_IMAGE_DIGEST"'), "deploy must verify served /rfs-version.json contains the immutable image digest");
check(ci.includes('if ! CANARY_VERSION_JSON="$(curl -fsS http://localhost:3004/rfs-version.json)"') && ci.includes('if ! PUBLIC_VERSION_JSON="$(curl -fsS https://fly.reidar.tech/rfs-version.json)"'), "deploy metadata fetch failures must enter cleanup/rollback paths under set -e");
check(!ci.includes("RFS_IMAGE_DIGEST=${{ steps.build.outputs.digest }}"), "workflow must not pass the build output digest back into the same Docker build");
check(ci.includes("PREVIOUS_IMAGE_ID=\"$(docker inspect -f '{{.Image}}' rfs") && ci.includes("PREVIOUS_IMAGE_REF=\"$(docker inspect -f '{{.Config.Image}}' rfs"), "deploy rollback must capture previous image ID and Config.Image fallback");
check(!ci.includes('"$PREVIOUS_IMAGE" || true'), "deploy rollback container start failure must be fatal");
check(ci.includes("PREVIOUS_PUBLIC_COMMIT"), "deploy rollback must capture the previous public version commit before promotion");
check(ci.includes("Rollback public version check failed") && ci.includes("$PREVIOUS_PUBLIC_COMMIT"), "deploy rollback must verify the previous public /rfs-version.json commit after rollback");
check(ci.includes('docker logs --tail=50 rfs_canary') && ci.includes('docker rm -f rfs_canary'), "deploy canary failures must print logs and clean up the canary container");

check(dockerfile.includes("node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920"), "Dockerfile must pin node:22-alpine by digest");
check(dockerfile.includes("nginx:alpine@sha256:8b1e78743a03dbb2c95171cc58639fef29abc8816598e27fb910ed2e621e589a"), "Dockerfile must pin nginx:alpine by digest");
check(dockerfile.includes("RUN apk upgrade --no-cache libcrypto3 libssl3 libxml2"), "Dockerfile must refresh fixed Alpine TLS/XML packages after the pinned nginx base image");
check(dockerfile.includes("COPY scripts/bootstrap-rfms-shared.mjs") && dockerfile.includes("RUN node scripts/bootstrap-rfms-shared.mjs") && bootstrapRfmsShared.includes("810fc9652da431eaf8978b85bf4af131605559b5"), "Dockerfile must bootstrap the audited RFMS/RFMC commit");
check(dockerfile.includes("npm ci --legacy-peer-deps"), "Dockerfile must use npm ci --legacy-peer-deps");
check(dockerfile.includes("RFS_COMMIT_SHA") && dockerfile.includes("RFS_IMAGE_REF"), "Dockerfile must pass release metadata into the build");
check(dockerfile.includes("USER 101:101"), "Dockerfile runtime stage must run nginx as fixed non-root UID/GID 101:101");
check(dockerfile.includes("COPY --from=builder --chown=101:101 /app/dist"), "Dockerfile must chown static assets for the non-root nginx user");
check(dockerfile.includes("EXPOSE 8080") && dockerfile.includes("http://127.0.0.1:8080/"), "Dockerfile runtime must expose and healthcheck non-privileged port 8080");
check(dockerfile.includes("ARG VITE_CESIUM_ION_TOKEN") && dockerfile.includes("VITE_CESIUM_ION_TOKEN=${VITE_CESIUM_ION_TOKEN}"), "Dockerfile must expose VITE_CESIUM_ION_TOKEN to the Vite build");

const requiredDockerignoreExclusions = [
  ".git",
  "dogfood-output/",
  "coverage/",
  "test-results/",
  "playwright-report/",
  "docs/reviews/",
  ".env",
  ".env*",
  "*.local",
  "*.log",
  ".DS_Store",
];
for (const pattern of requiredDockerignoreExclusions) {
  check(dockerignoreHasLine(pattern), `.dockerignore must exclude ${pattern}`);
}
const requiredDockerBuildInputs = [
  "package.json",
  "package-lock.json",
  "src/",
  "public/",
  "nginx.conf",
  "Dockerfile",
];
for (const pattern of requiredDockerBuildInputs) {
  check(!dockerignoreHasLine(pattern), `.dockerignore must not exclude build input ${pattern}`);
}

check(nginx.includes("listen 8080;"), "nginx.conf must listen on non-privileged port 8080");
check(nginx.includes("client_body_temp_path /tmp/client_temp;") && nginx.includes("proxy_temp_path /tmp/proxy_temp;"), "nginx.conf must put temp paths on tmpfs-compatible /tmp locations");

const requiredSecurityHeaders = [
  'add_header X-Content-Type-Options "nosniff" always;',
  'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
  'add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()" always;',
  'add_header X-Frame-Options "DENY" always;',
  'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
];
for (const header of requiredSecurityHeaders) {
  const occurrences = nginx.match(new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? [];
  check(occurrences.length >= 2, `nginx.conf must set ${header} at server and /assets levels with always`);
}
check(!/Cross-Origin-Opener-Policy|Cross-Origin-Embedder-Policy/.test(nginx), "nginx.conf must not set COOP/COEP headers");

const hardenedRunFlags = [
  "--read-only",
  "--cap-drop ALL",
  "--security-opt no-new-privileges",
  "--tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=755",
  "--tmpfs /var/run:rw,noexec,nosuid,size=4m,uid=101,gid=101,mode=755",
  "--tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=1777",
  "--pids-limit 128",
  "--user 101:101",
  "--memory 256m",
  "--cpus 1.0",
];
for (const flag of hardenedRunFlags) {
  check(ci.includes(flag), `workflow docker runs must include ${flag}`);
}
check((ci.match(/127\.0\.0\.1:3005:8080/g) ?? []).length >= 2 && ci.includes("127.0.0.1:3004:8080"), "workflow smoke/deploy runs must map host ports to container port 8080");

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
check(read("scripts/write-version-metadata.mjs").includes("RFS_REQUIRE_IMAGE_DIGEST"), "release metadata generator must support a release-mode guard that rejects unknown image digests");
check(!existsSync(resolve(root, "public/rfs-version.json")), "public/rfs-version.json must not be tracked or generated in the source tree");

check(branchProtectionRunbook.includes("Do not run mutation commands unless the user gives explicit current authorization"), "branch-protection runbook must require explicit authorization before remote mutations");
check(branchProtectionRunbook.includes("secret-scan") && branchProtectionRunbook.includes("deploy"), "branch-protection runbook must document required release-governance checks");
check(branchProtectionChecker.includes("allow_force_pushes") && branchProtectionChecker.includes("allow_deletions") && branchProtectionChecker.includes("enforce_admins"), "branch-protection checker must verify admins, force-push, and deletion policy");
check(releaseCloseoutRunbook.includes("Pushed is not deployed") && releaseCloseoutRunbook.includes("CI green is not live"), "release-closeout runbook must preserve pushed/CI/live non-claim boundaries");
check(releaseCloseoutRunbook.includes("check-exact-sha-release.mjs") && releaseCloseoutRunbook.includes("rfs-version.json"), "release-closeout runbook must document exact-SHA live metadata verification");
check(exactShaReleaseChecker.includes("status === 'completed'") && exactShaReleaseChecker.includes("conclusion === 'success'"), "exact-SHA release checker must require completed/success GitHub Actions status");
check(exactShaReleaseChecker.includes("live.commit") && exactShaReleaseChecker.includes("live.version") && exactShaReleaseChecker.includes("imageDigest"), "exact-SHA release checker must verify live commit/version/image digest metadata");

if (failures.length > 0) {
  stderr.write("release hardening checks failed:\n");
  for (const failure of failures) stderr.write(`- ${failure}\n`);
  exit(1);
}

stdout.write("release hardening checks passed\n");
