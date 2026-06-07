import { describe, expect, it } from 'vitest';
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
});
