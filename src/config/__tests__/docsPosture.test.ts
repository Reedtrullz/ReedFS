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
import packageJson from '../../../package.json';

describe('canonical docs posture', () => {
  it('keeps COOP/COEP and worker/SAB policy aligned with Cesium compatibility', () => {
    expect(readme).not.toMatch(/dev server sets COOP\/COEP headers/i);
    expect(readme).toMatch(/does \*\*not\*\* set COOP\/COEP headers/i);
    expect(readme).toMatch(/instantiates a real browser module Worker/i);
    expect(readme).toMatch(/does \*\*not\*\* require SharedArrayBuffer\/COOP\/COEP/i);
    expect(readme).toMatch(/does \*\*not\*\* set COOP\/COEP headers/i);
    expect(architecture).toMatch(/no SharedArrayBuffer\/COOP\/COEP dependency is introduced/i);
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
