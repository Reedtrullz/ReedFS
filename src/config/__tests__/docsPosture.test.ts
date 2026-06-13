import { describe, expect, it } from 'vitest';
import ciWorkflow from '../../../.github/workflows/ci.yml?raw';
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
});
