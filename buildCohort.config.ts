import { randomBytes } from 'node:crypto';

/** Cohort binds one compilation; it is not a claim about Git provenance. */
export function createBuildCohort(configuredCommit?: string, local?: { commit: string; dirty: boolean }): string {
  if (configuredCommit === 'unknown' || (!configuredCommit && !local)) {
    return `unversioned-${randomBytes(20).toString('hex')}`;
  }
  const commit = configuredCommit || local?.commit;
  if (!commit || !/^[a-f0-9]{40}$/i.test(commit)) throw new Error('RFS commit identity must be a full SHA or unknown');
  // Changed local source must not share a compilation cohort with another dirty build.
  return !configuredCommit && local?.dirty ? `${commit}-dirty-${randomBytes(20).toString('hex')}` : commit;
}
