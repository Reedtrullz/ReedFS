import type { SimulationFailureEvidence } from '../store/simStore';

export const MAX_FAILURE_EXPORT_BYTES = 256 * 1024;

/** Local, user-requested export. Bounded diagnostic data is never uploaded. */
export function serializeSimulationFailure(failure: SimulationFailureEvidence): string {
  let remainingValues = 20_000;
  let remainingBytes = MAX_FAILURE_EXPORT_BYTES - 1024;
  let truncated = false;
  const encoder = new TextEncoder();
  const seen = new WeakSet<object>();
  function cost(value: unknown): void { remainingBytes -= encoder.encode(JSON.stringify(value)).length; }
  function bounded(value: unknown, depth = 0): unknown {
    if (--remainingValues < 0 || depth > 24 || remainingBytes < 64) { truncated = true; return null; }
    if (typeof value === 'number') {
      const number = Number.isFinite(value) ? value : `[${String(value)}]`;
      cost(number); return number;
    }
    if (typeof value === 'string') {
      const limit = Math.min(8192, Math.floor((remainingBytes - 32) / 6));
      const text = value.length > limit ? value.slice(0, limit) : value;
      if (text.length < value.length) truncated = true;
      cost(text); return text;
    }
    if (value == null || typeof value === 'boolean') { cost(value ?? null); return value ?? null; }
    if (typeof value !== 'object') { const text = `[${typeof value}]`; cost(text); return text; }
    if (seen.has(value)) { cost('[repeated reference]'); return '[repeated reference]'; }
    seen.add(value); remainingBytes -= 2;
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value.slice(0, 4096)) {
        if (remainingBytes < 64 || remainingValues < 1) { truncated = true; break; }
        remainingBytes--; result.push(bounded(item, depth + 1));
      }
      if (value.length > result.length) truncated = true;
      return result;
    }
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value);
    for (const [key, item] of entries.slice(0, 4096)) {
      const keyCost = encoder.encode(JSON.stringify(key)).length + 2;
      if (key.length > 256 || remainingBytes < keyCost + 64 || remainingValues < 1) { truncated = true; break; }
      remainingBytes -= keyCost; result[key] = bounded(item, depth + 1);
    }
    if (entries.length > Object.keys(result).length) truncated = true;
    return result;
  }
  const evidence = bounded(failure);
  return JSON.stringify({ version: 1, privacy: 'Local diagnostic export; contains flight position and route. Review before sharing.', truncated, evidence });
}
