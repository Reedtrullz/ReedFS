import { describe, expect, it } from 'vitest';
import ciWorkflow from '../../../.github/workflows/ci.yml?raw';
import dockerfile from '../../../Dockerfile?raw';
import nginxConf from '../../../nginx.conf?raw';
import readme from '../../../README.md?raw';
import architecture from '../../../docs/architecture.md?raw';
import physicsInvariants from '../../../docs/physics-invariants.md?raw';

describe('canonical docs posture', () => {
  it('keeps COOP/COEP and worker/SAB policy aligned with Cesium compatibility', () => {
    expect(readme).not.toMatch(/dev server sets COOP\/COEP headers/i);
    expect(readme).toMatch(/does \*\*not\*\* set COOP\/COEP headers/i);
    expect(readme).toMatch(/does not instantiate a browser Worker or require SharedArrayBuffer\/COOP\/COEP/i);
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
});
