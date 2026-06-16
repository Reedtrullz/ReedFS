import { describe, expect, it } from 'vitest';
import dockerignore from '../../../.dockerignore?raw';
import codeowners from '../../../.github/CODEOWNERS?raw';
import bugReportTemplate from '../../../.github/ISSUE_TEMPLATE/bug_report.yml?raw';
import featureRequestTemplate from '../../../.github/ISSUE_TEMPLATE/feature_request.yml?raw';
import pullRequestTemplate from '../../../.github/pull_request_template.md?raw';
import ciWorkflow from '../../../.github/workflows/ci.yml?raw';
import dockerfile from '../../../Dockerfile?raw';
import nginxConf from '../../../nginx.conf?raw';
import releaseMetadataScript from '../../../scripts/write-version-metadata.mjs?raw';
import contributing from '../../../CONTRIBUTING.md?raw';
import license from '../../../LICENSE?raw';
import readme from '../../../README.md?raw';
import security from '../../../SECURITY.md?raw';
import architecture from '../../../docs/architecture.md?raw';
import physicsInvariants from '../../../docs/physics-invariants.md?raw';
import roadmap from '../../../docs/roadmap.md?raw';
import packageJson from '../../../package.json';

const automationFiles = import.meta.glob('../../../.github/{dependabot.yml,workflows/codeql.yml}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;
const bootstrapFiles = import.meta.glob('../../../scripts/bootstrap-rfms-shared.mjs', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;
const dependabotConfig = automationFiles['../../../.github/dependabot.yml'] ?? '';
const codeqlWorkflow = automationFiles['../../../.github/workflows/codeql.yml'] ?? '';
const bootstrapScript = bootstrapFiles['../../../scripts/bootstrap-rfms-shared.mjs'] ?? '';
const RFMS_SHARED_COMMIT = '810fc9652da431eaf8978b85bf4af131605559b5';

describe('canonical docs posture', () => {
  it('keeps COOP/COEP and worker/SAB policy aligned with Cesium compatibility', () => {
    expect(readme).not.toMatch(/dev server sets COOP\/COEP headers/i);
    expect(readme).toMatch(/does \*\*not\*\* set COOP\/COEP headers/i);
    expect(readme).toMatch(/instantiates a real browser module Worker/i);
    expect(readme).toMatch(/does \*\*not\*\* require SharedArrayBuffer\/COOP\/COEP/i);
    expect(readme).toMatch(/does \*\*not\*\* set COOP\/COEP headers/i);
    expect(architecture).toMatch(/no SharedArrayBuffer\/COOP\/COEP dependency is introduced/i);
  });

  it('keeps worker physics documented as experimental and synchronous-store default-off', () => {
    expect(readme).toMatch(/production still defaults to the main-thread adapter/i);
    expect(readme).toMatch(/current `simStore\.tick\(\)` path remains synchronous/i);
    expect(architecture).toMatch(/sync `step\(\)` still falls back to main-thread physics until the frame scheduler becomes async-aware/i);
    expect(roadmap).toMatch(/experimental browser-Worker runtime remains default-off/i);
    expect(roadmap).toMatch(/`simStore\.tick\(\)` remains synchronous/i);
    expect(roadmap).toMatch(/async scheduler\/store bridge plan is required before default-on/i);
  });

  it('records rendering, weather, audio, immersion, and PWA disposition without snapshot overclaims', () => {
    expect(readme).toMatch(/Rendering\/weather\/audio\/immersion disposition/i);
    expect(roadmap).toMatch(/2026-06-16 rendering\/weather\/audio\/immersion disposition/i);
    for (const requiredDisposition of [
      /Cockpit\/interior: partial/i,
      /Weather\/atmosphere: partial/i,
      /Audio: partial/i,
      /Scene loading\/error states: partial/i,
      /PWA: deferred/i,
      /Visual snapshots are not proof of audio, weather, PWA, or error-state behavior/i,
    ]) {
      expect(readme).toMatch(requiredDisposition);
      expect(roadmap).toMatch(requiredDisposition);
    }
  });

  it('documents the narrowed integrate signature and same-tick config ordering', () => {
    expect(physicsInvariants).toMatch(/applyPilotConfiguration\(\)/);
    expect(physicsInvariants).toMatch(/accepts only aircraft, effective controls, spec, timestep, and optional wind/i);
  });

  it('keeps CI aligned with local dependency checks and PR Docker smoke', () => {
    expect(ciWorkflow).toContain('npm run check:deps');
    expect(ciWorkflow).toContain('push: false');
    expect(ciWorkflow).toContain('load: true');
    expect(ciWorkflow).toContain('curl -fsS http://localhost:3005/');
    expect(ciWorkflow).toContain('curl -fsS http://localhost:3005/rfs-version.json');
  });

  it('keeps black-box guard in local, CI, and README gates', () => {
    const expectedCheckChain =
      'npm run check:deps && npm run check:release && npm run check:blackbox && npm run lint:ci && npm run typecheck && npm run test && npm run build && npm run check:bundle';
    expect(packageJson.scripts.check).toBe(expectedCheckChain);
    expect(readme).toContain(expectedCheckChain);

    const testJobStart = ciWorkflow.indexOf('  test:\n');
    const dockerSmokeStart = ciWorkflow.indexOf('\n  docker-smoke:', testJobStart);
    const testJob = ciWorkflow.slice(testJobStart, dockerSmokeStart);
    expect(testJob).toMatch(
      /- run: npm run check:release\s+- run: npm run check:blackbox\s+- run: npm run lint:ci/,
    );
  });

  it('makes deployment rollback failures fatal and publicly verifiable', () => {
    expect(ciWorkflow).not.toContain('"$PREVIOUS_IMAGE" || true');
    expect(ciWorkflow).toContain('PREVIOUS_PUBLIC_COMMIT');
    expect(ciWorkflow).toContain('Rollback public version check failed');
    expect(ciWorkflow).toContain('$PREVIOUS_PUBLIC_COMMIT');
  });

  it('runs nginx as a non-root read-only container with tmpfs runtime state', () => {
    expect(dockerfile).toContain('USER 101:101');
    expect(dockerfile).toContain('COPY --from=builder --chown=101:101 /app/dist');
    expect(dockerfile).toContain('EXPOSE 8080');
    expect(dockerfile).toContain('http://127.0.0.1:8080/');
    expect(nginxConf).toContain('listen 8080;');
    expect(nginxConf).toContain('client_body_temp_path /tmp/client_temp;');
    for (const requiredFlag of [
      '--read-only',
      '--cap-drop ALL',
      '--security-opt no-new-privileges',
      '--tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=755',
      '--tmpfs /var/run:rw,noexec,nosuid,size=4m,uid=101,gid=101,mode=755',
      '--tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=1777',
      '--pids-limit 128',
      '--user 101:101',
    ]) {
      expect(ciWorkflow).toContain(requiredFlag);
    }
    expect(ciWorkflow).toContain('127.0.0.1:3005:8080');
    expect(ciWorkflow).toContain('127.0.0.1:3004:8080');
  });

  it('keeps local artifacts and secrets out of Docker build contexts without excluding build inputs', () => {
    for (const requiredExclusion of [
      '.git',
      'dogfood-output/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      'docs/reviews/',
      '.env',
      '.env*',
      '*.local',
      '*.log',
      '.DS_Store',
    ]) {
      expect(dockerignore).toContain(requiredExclusion);
    }

    for (const requiredInput of [
      'package.json',
      'package-lock.json',
      'src/',
      'public/',
      'nginx.conf',
      'Dockerfile',
    ]) {
      expect(dockerignore).not.toContain(requiredInput);
    }
  });

  it('serves browser security headers without enabling COOP or COEP', () => {
    for (const header of [
      'X-Content-Type-Options "nosniff" always',
      'Referrer-Policy "strict-origin-when-cross-origin" always',
      'Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()" always',
      'X-Frame-Options "DENY" always',
      'Strict-Transport-Security "max-age=31536000; includeSubDomains" always',
    ]) {
      expect(nginxConf).toContain(`add_header ${header};`);
    }
    expect(nginxConf).not.toMatch(/Cross-Origin-Opener-Policy|Cross-Origin-Embedder-Policy/);
    expect(architecture).toMatch(/Cesium-compatible security headers/i);
    expect(architecture).toMatch(/does not set COOP\/COEP/i);
  });

  it('provides a one-command RFMS shared bootstrap that CI and Docker reuse', () => {
    expect(packageJson.scripts.bootstrap).toBe('node scripts/bootstrap-rfms-shared.mjs');
    expect(packageJson.scripts['bootstrap:check']).toBe('node scripts/bootstrap-rfms-shared.mjs --check');
    expect(bootstrapScript).toContain(RFMS_SHARED_COMMIT);
    expect(bootstrapScript).toContain('https://github.com/Reedtrullz/RFMC.git');
    expect(bootstrapScript.indexOf('if (status.length > 0)')).toBeGreaterThanOrEqual(0);
    expect(bootstrapScript.indexOf('if (status.length > 0)')).toBeLessThan(
      bootstrapScript.indexOf('if (head === RFMS_COMMIT && existsSync(RFMS_SHARED_PACKAGE))'),
    );

    expect(ciWorkflow).toContain('node scripts/bootstrap-rfms-shared.mjs');
    expect(ciWorkflow).toContain('node scripts/bootstrap-rfms-shared.mjs --check');
    expect(ciWorkflow).not.toContain('git -C ../RFMS fetch --depth 1 origin');

    expect(dockerfile).toContain('COPY scripts/bootstrap-rfms-shared.mjs');
    expect(dockerfile).toContain('RUN node scripts/bootstrap-rfms-shared.mjs');
    expect(dockerfile).not.toContain('git -C RFMS fetch --depth 1 origin');

    expect(readme).toContain('npm run bootstrap');
    expect(readme).toContain('npm run bootstrap:check');
    expect(readme).toContain(RFMS_SHARED_COMMIT);
  });

  it('automates dependency updates, CodeQL analysis, and PR-safe container scanning', () => {
    for (const ecosystem of [
      'package-ecosystem: npm',
      'package-ecosystem: github-actions',
      'package-ecosystem: docker',
    ]) {
      expect(dependabotConfig).toContain(ecosystem);
    }
    expect(dependabotConfig).toContain('directory: /');
    expect(dependabotConfig).toContain('interval: weekly');

    expect(codeqlWorkflow).toContain('github/codeql-action/init@');
    expect(codeqlWorkflow).toContain('github/codeql-action/analyze@');
    expect(codeqlWorkflow).toContain('security-events: write');
    expect(codeqlWorkflow).toContain('javascript-typescript');

    expect(ciWorkflow).toContain('aquasecurity/trivy-action@');
    expect(ciWorkflow).toContain('image-ref: rfs:pr-smoke-${{ github.sha }}');
    expect(ciWorkflow).toContain("exit-code: '1'");
    expect(ciWorkflow).toContain('severity: HIGH,CRITICAL');
  });

  it('has OSS package metadata and contributor/security governance files', () => {
    expect(packageJson.private).toBe(false);
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/Reedtrullz/ReedFS.git',
    });
    expect(packageJson.bugs).toEqual({ url: 'https://github.com/Reedtrullz/ReedFS/issues' });
    expect(packageJson.homepage).toBe('https://github.com/Reedtrullz/ReedFS#readme');

    expect(license).toMatch(/MIT License/);
    expect(security).toMatch(/Reporting a vulnerability/i);
    expect(contributing).toMatch(/Proof boundary/i);
    expect(codeowners).toContain('* @Reedtrullz');
    expect(bugReportTemplate).toMatch(/name: Bug report/);
    expect(featureRequestTemplate).toMatch(/name: Feature request/);
    expect(pullRequestTemplate).toMatch(/Proof boundary \/ non-claims/);

    expect(readme).toMatch(/Contributing/i);
    expect(readme).toMatch(/Security/i);
    expect(readme).toMatch(/License/i);
    expect(readme).toMatch(/CI\/CD\]\(https:\/\/github\.com\/Reedtrullz\/ReedFS\/actions\/workflows\/ci\.yml\/badge\.svg\?branch=master/i);
    expect(readme).toMatch(/Repository governance status/i);
    expect(readme).toMatch(/strict required status checks: `secret-scan`, `test`, `publish`, `deploy`/i);
    expect(readme).toMatch(/not yet complete/i);
    expect(readme).toMatch(/GitHub About description, homepage, and topics are still blank/i);
    expect(readme).toMatch(/No code of conduct is currently published/i);
  });

  it('serves immutable post-push image digest provenance in release metadata', () => {
    expect(ciWorkflow).toContain('EXPECTED_IMAGE_DIGEST=${{ needs.publish.outputs.image_digest }}');
    expect(ciWorkflow).toContain('VERSION_METADATA_PATH');
    expect(ciWorkflow).toContain('"imageDigest": "$EXPECTED_IMAGE_DIGEST"');
    expect(ciWorkflow).toContain('-v "$VERSION_METADATA_PATH:/usr/share/nginx/html/rfs-version.json:ro"');
    expect(ciWorkflow).toContain('grep -F "$EXPECTED_IMAGE_DIGEST"');
    expect(ciWorkflow).toContain('if ! CANARY_VERSION_JSON="$(curl -fsS http://localhost:3004/rfs-version.json)"');
    expect(ciWorkflow).toContain('if ! PUBLIC_VERSION_JSON="$(curl -fsS https://fly.reidar.tech/rfs-version.json)"');
    expect(ciWorkflow).not.toContain('RFS_IMAGE_DIGEST=${{ steps.build.outputs.digest }}');
    expect(releaseMetadataScript).toContain('RFS_REQUIRE_IMAGE_DIGEST');
  });
});
