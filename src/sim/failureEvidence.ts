import type { SimulationFailureEvidence } from '../store/simStore';

/** Local, user-requested export. Bounded diagnostic data is never uploaded. */
export function serializeSimulationFailure(failure: SimulationFailureEvidence): string {
  let remaining = 20_000;
  const seen = new WeakSet<object>();
  function bounded(value: unknown, depth = 0): unknown {
    if (--remaining < 0 || depth > 24) return '[omitted: diagnostic limit]';
    if (typeof value === 'number') return Number.isFinite(value) ? value : `[${String(value)}]`;
    if (typeof value === 'string') return value.length > 8192 ? `${value.slice(0, 8192)}[truncated]` : value;
    if (value == null || typeof value === 'boolean') return value ?? null;
    if (typeof value !== 'object') return `[${typeof value}]`;
    if (seen.has(value)) return '[repeated reference]';
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 4096).map((item) => bounded(item, depth + 1));
    return Object.fromEntries(Object.entries(value).slice(0, 4096).map(([key, item]) => [key, bounded(item, depth + 1)]));
  }
  return JSON.stringify({ version: 1, privacy: 'Local diagnostic export; contains flight position and route. Review before sharing.', evidence: bounded(failure) }, null, 2);
}
