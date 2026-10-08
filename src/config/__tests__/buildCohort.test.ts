import { expect, it } from 'vitest';
import { createBuildCohort } from '../../../buildCohort.config';

const commit = '1234567890abcdef1234567890abcdef12345678';

it('keeps qualified clean Git identities and rejects malformed release identity', () => {
  expect(createBuildCohort(commit)).toBe(commit);
  expect(createBuildCohort(undefined, { commit, dirty: false })).toBe(commit);
  expect(() => createBuildCohort('short-sha')).toThrow(/full SHA or unknown/);
});

it('gives unknown archives and Docker builds distinct opaque cohorts without claiming a Git SHA', () => {
  const first = createBuildCohort('unknown');
  expect(first).toMatch(/^unversioned-[a-f0-9]{40}$/);
  expect(createBuildCohort('unknown')).not.toBe(first);
  expect(createBuildCohort()).toMatch(/^unversioned-[a-f0-9]{40}$/);
});

it('does not reuse a cohort across changed local builds at the same Git commit', () => {
  const first = createBuildCohort(undefined, { commit, dirty: true });
  expect(first).toMatch(new RegExp(`^${commit}-dirty-[a-f0-9]{40}$`));
  expect(createBuildCohort(undefined, { commit, dirty: true })).not.toBe(first);
});
