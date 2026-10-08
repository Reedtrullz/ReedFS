import type { SimStore } from '../store/simStore';
import type { CommandRevisions } from '../store/commandBoundaries';

export function observationStatus(s: Pick<SimStore, 'simulationCommit' | 'commandRevisions' | 'status'> & { invalid: boolean }, now: number) {
  const commit = s.simulationCommit;
  const ageMs = commit ? Math.max(0, now - commit.committedAtMs) : null;
  const pending = commit && (Object.keys(s.commandRevisions) as Array<keyof CommandRevisions>).some((key) => s.commandRevisions[key] !== commit.revisions[key]);
  const state = s.invalid ? 'INVALID'
    : s.status === 'paused' ? 'PAUSED'
    : s.status === 'stopped' ? 'PREVIEW'
    : !commit ? 'WAITING'
    : ageMs! > 1000 ? 'STALE'
    : pending ? 'WAITING' : 'CURRENT';
  return { state, ageMs, stepIndex: commit?.stepIndex ?? null };
}
