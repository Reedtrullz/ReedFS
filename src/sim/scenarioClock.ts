import type { AircraftState } from './types';

export const SCENARIO_CLOCK_ID = 'utc-epoch-ms/committed-sim-time-ms/v2';
export const DEFAULT_SCENARIO_UTC_MS = Date.UTC(2026, 8, 24, 12);
export const LEGACY_SCENARIO_MIDNIGHT_MS = Date.UTC(2026, 8, 24);
const MIN_UTC_MS = Date.UTC(1900, 0, 1);
const MAX_UTC_MS = Date.UTC(2101, 0, 1);
const DAY_MS = 86_400_000;
type AircraftClock = Pick<AircraftState, 'utcEpochMs' | 'simTime' | 'timeOfDay'>;

export function scenarioUtcMs(clock: Pick<AircraftClock, 'utcEpochMs' | 'simTime'>): number {
  return clock.utcEpochMs + clock.simTime;
}

export function utcHours(utcMs: number): number {
  return ((utcMs % DAY_MS + DAY_MS) % DAY_MS) / 3_600_000;
}

export function isScenarioUtcMs(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_UTC_MS && value < MAX_UTC_MS;
}

export function hasCoherentScenarioClock(clock: AircraftClock): boolean {
  return isScenarioUtcMs(clock.utcEpochMs) && Number.isFinite(clock.simTime) && clock.simTime >= 0
    && isScenarioUtcMs(scenarioUtcMs(clock)) && Number.isFinite(clock.timeOfDay)
    && Math.abs(clock.timeOfDay - utcHours(scenarioUtcMs(clock))) <= 1 / 3_600_000_000;
}

/** Explicit UTC input; reject normalized invalid dates such as February31. */
export function parseScenarioUtc(text: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{3}))?)?Z$/.exec(text);
  if (!match) return null;
  const canonical = `${match[1]}:${match[2] ?? '00'}.${match[3] ?? '000'}Z`;
  const value = Date.parse(canonical);
  return isScenarioUtcMs(value) && new Date(value).toISOString() === canonical ? value : null;
}
