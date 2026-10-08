import { useState } from 'react';
import { useSimStore } from '../store/simStore';
import { DEFAULT_SCENARIO_UTC_MS, scenarioUtcMs } from '../sim/scenarioClock';

export function ScenarioClockPanel() {
  // Whole-second presentation avoids physics-frequency rebuilds. A microsecond
  // allowance absorbs anchor-edit cancellation at the supported date bounds.
  const utc = useSimStore((s) => s.aircraft ? Math.floor((scenarioUtcMs(s.aircraft) + 0.001) / 1000) * 1000 : DEFAULT_SCENARIO_UTC_MS);
  const anchor = useSimStore((s) => s.aircraft?.utcEpochMs);
  const status = useSimStore((s) => s.status);
  const setUtc = useSimStore((s) => s.setScenarioUtc);
  const fault = useSimStore((s) => s.simulationFailure);
  const [draft, setDraft] = useState<{ anchor: number | undefined; value: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const iso = Number.isFinite(utc) ? new Date(utc).toISOString() : null;
  const disabled = status === 'running' || Boolean(fault && !fault.recovered) || !iso || typeof setUtc !== 'function';
  const value = draft?.anchor === anchor && draft ? draft.value : iso?.slice(0, 19) ?? '';
  return (
    <details style={{ marginTop: 10, fontSize: 11 }}>
      <summary>Date and time (UTC)</summary>
      <p>Scenario UTC: <time aria-label="Scenario UTC" dateTime={iso ?? undefined}>{iso?.replace('.000Z', 'Z') ?? 'Unavailable'}</time></p>
      <label htmlFor="scenario-utc">UTC date and time</label>
      <input id="scenario-utc" type="datetime-local" step="1" min="1900-01-01T00:00" max="2100-12-31T23:59:59"
        value={value} disabled={disabled} onChange={(event) => setDraft({ anchor, value: event.currentTarget.value })}
        style={{ display: 'block', width: '100%', colorScheme: 'dark', margin: '6px 0' }} />
      <button type="button" disabled={disabled} onClick={() => {
        const changed = setUtc(`${value}Z`);
        setMessage(changed ? 'Scenario UTC applied.' : 'Invalid UTC date/time; flight unchanged.');
        if (changed) setDraft(null);
      }}>Apply UTC date/time</button>
      <p>Pause to adjust. Simulation speed advances this clock; reset or a new scenario restores 24 September 2026 at 12:00 UTC.</p>
      {message ? <p role="status">{message}</p> : null}
    </details>
  );
}
