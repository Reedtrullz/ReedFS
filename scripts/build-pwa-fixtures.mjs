import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

// Two bounded, synthetic build identities; these are not real Git revisions.
for (const [version, cohort] of [['v1', 'a'.repeat(40)], ['v2', 'b'.repeat(40)]]) {
  execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', `dist/pwa-${version}`], {
    stdio: 'inherit', env: { ...process.env, RFS_COMMIT_SHA: cohort, VITE_RFS_VISUAL_TEST: '0', VITE_RFS_SMOKE: '1' },
  });
}
