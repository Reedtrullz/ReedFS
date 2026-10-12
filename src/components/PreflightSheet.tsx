import type { CSSProperties } from 'react';
import type { FlightPlanWaypoint } from '@shared/types/fmc';
import { useSimStore } from '../store/simStore';
import { scenarioById } from '../sim/scenarios';
import { maybeFindPerformanceCardForScenario } from '../sim/data/performance/b737PerformanceCards';
import { orientedRunwayByAirportAndId, SUPPORTED_RUNWAYS, type RunwayOverrides } from '../viewport/runwayData';

function runwayAtWaypoint(airport: string, waypoint: FlightPlanWaypoint | undefined, overrides: RunwayOverrides | null) {
  if (!waypoint) return undefined;
  for (const runway of SUPPORTED_RUNWAYS.filter((candidate) => candidate.airport === airport)) {
    for (const id of [runway.id, runway.oppositeId]) {
      const oriented = orientedRunwayByAirportAndId(airport, id);
      if (oriented && waypoint.lat !== undefined && waypoint.lon !== undefined
        && Math.abs(oriented.start.lat - waypoint.lat) < 0.000001
        && Math.abs(oriented.start.lon - waypoint.lon) < 0.000001) {
        return orientedRunwayByAirportAndId(airport, id, overrides);
      }
    }
  }
  return undefined;
}

const sheetStyle: CSSProperties = {
  background: 'var(--rfs-color-surface)',
  borderBottom: '1px solid var(--rfs-color-border)',
  color: 'var(--rfs-color-text)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.5,
  minWidth: 0,
  padding: 10,
};
const rowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr)', gap: 8, margin: 0 };

function SheetRow({ label, value }: { label: string; value: string }) {
  return <div style={rowStyle}><dt style={{ color: 'var(--rfs-color-text-muted)' }}>{label}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd></div>;
}

export function PreflightSheet() {
  const scenarioId = useSimStore((s) => s.selectedScenarioId);
  const flightPlan = useSimStore((s) => s.flightPlan);
  const overrides = useSimStore((s) => s.runwayOverrides);
  const weather = useSimStore((s) => s.weather);
  const wind = useSimStore((s) => s.wind);
  const grossWeight = useSimStore((s) => s.aircraft.grossWeight);
  const zeroFuelWeight = useSimStore((s) => s.aircraft.zeroFuelWeight);
  const fuel = useSimStore((s) => s.aircraft.fuel.totalFuel);
  const cg = useSimStore((s) => s.aircraft.cg);
  const trim = useSimStore((s) => s.aircraft.config.stabilizerTrimUnits);
  const actualFlaps = useSimStore((s) => s.aircraft.config.flapSetting);
  const flaps = useSimStore((s) => s.pilotInputs.flapLever);
  const gear = useSimStore((s) => s.pilotInputs.gearLever);
  const spec = useSimStore((s) => s.spec);
  const scenario = scenarioById(scenarioId);
  const card = maybeFindPerformanceCardForScenario(scenarioId);
  const firstWaypoint = flightPlan?.waypoints[0];
  const scenarioRunway = orientedRunwayByAirportAndId(scenario.runway.airport, scenario.runway.runway, overrides);
  const departure = flightPlan
    ? runwayAtWaypoint(flightPlan.origin, firstWaypoint, overrides)
      ?? (firstWaypoint?.coordinateSource === 'synthetic' && firstWaypoint.ident === scenario.runway.airport
        && flightPlan.origin === scenario.runway.airport ? scenarioRunway : undefined)
    : scenarioRunway;
  const arrival = flightPlan ? runwayAtWaypoint(flightPlan.destination, flightPlan.waypoints.at(-1), overrides) : undefined;
  const windAvailable = wind && Number.isFinite(wind.dir) && Number.isFinite(wind.speed) && wind.speed >= 0;
  const angle = departure && windAvailable ? (wind.dir - departure.headingDeg) * Math.PI / 180 : 0;
  const headwind = windAvailable ? wind.speed * Math.cos(angle) : 0;
  const crosswind = windAvailable ? wind.speed * Math.sin(angle) : 0;
  const loadingValid = [grossWeight, zeroFuelWeight, fuel, cg].every(Number.isFinite)
    && grossWeight <= spec.maxTakeoffWeight && grossWeight >= spec.emptyWeight
    && zeroFuelWeight >= spec.emptyWeight && fuel >= 0 && fuel <= spec.maxFuel
    && Math.abs(grossWeight - zeroFuelWeight - fuel) < 1
    && cg >= spec.cgLimits[0] && cg <= spec.cgLimits[1];
  const weatherValid = weather && Number.isFinite(weather.qnhHpa) && weather.qnhHpa >= 850 && weather.qnhHpa <= 1100
    && Number.isFinite(weather.surfaceTemperatureC) && weather.surfaceTemperatureC >= -60 && weather.surfaceTemperatureC <= 60;
  const fixtureMatches = card && loadingValid && weatherValid && windAvailable
    && departure?.airport === card.airport && departure.id === card.runway
    && Math.abs(grossWeight - card.grossWeightKg) < 1
    && flaps === card.flapSetting && Math.abs(actualFlaps - card.flapSetting) < 0.01
    && Math.abs(trim - card.stabilizerTrimUnits) < 0.05
    && Math.abs(cg - scenario.cgPercent) < 0.01
    && weather.stationIcao === departure.airport
    && weather.qnhHpa === scenario.weather.qnhHpa && weather.surfaceTemperatureC === scenario.weather.surfaceTemperatureC
    && wind.dir === scenario.wind.dir && wind.speed === scenario.wind.speed && wind.gustSpeed === scenario.wind.gustSpeed
    && !overrides;
  const checks = [
    ...(!departure ? ['Departure runway not identified.'] : []),
    ...(!loadingValid ? ['Loading outside the simulator envelope or mass balance invalid.'] : []),
    ...(!weatherValid || !windAvailable ? ['Weather unavailable or outside the simulator envelope.'] : []),
    ...(departure && weather?.stationIcao !== departure.airport ? ['Weather station differs from departure; local conditions unverified.'] : []),
    ...(overrides ? ['Edited runway geometry; performance references unavailable.'] : []),
  ];

  return (
    <section aria-label="Preflight sheet" style={sheetStyle}>
      <h2 style={{ fontSize: 14, margin: '0 0 8px', letterSpacing: 0 }}>Preflight</h2>
      <dl style={{ margin: 0, display: 'grid', gap: 4 }}>
        <SheetRow label="Route" value={flightPlan ? `${flightPlan.origin} to ${flightPlan.destination}` : 'No route loaded'} />
        <SheetRow label="Departure" value={departure ? `${departure.airport} ${departure.id} / ${Math.round(departure.headingDeg)} deg true` : 'Unidentified'} />
        <SheetRow label="Runway" value={departure ? `${Math.round(departure.lengthM)} m / ${Math.round(departure.elevationFt)} ft` : 'Unavailable'} />
        <SheetRow label="Arrival" value={arrival ? `${arrival.airport} ${arrival.id} / ${Math.round(arrival.lengthM)} m` : 'Runway not identified'} />
        <SheetRow label="Gross / ZFW" value={`${Math.round(grossWeight)} / ${Math.round(zeroFuelWeight)} kg`} />
        <SheetRow label="Fuel onboard" value={`${Math.round(fuel)} kg`} />
        <SheetRow label="CG" value={`${cg.toFixed(1)}% MAC`} />
        <SheetRow label="Flaps / trim" value={`${flaps} commanded, ${actualFlaps.toFixed(1)} actual / ${trim.toFixed(1)} units`} />
        <SheetRow label="Gear" value={gear} />
        <SheetRow label="Weather" value={weatherValid ? `${weather.stationIcao} / ${weather.surfaceTemperatureC} C / ${weather.qnhHpa} hPa` : 'Unavailable'} />
        <SheetRow label="Wind from" value={windAvailable ? `${wind.dir} deg true / ${wind.speed} kt${wind.gustSpeed !== undefined ? ` gust ${wind.gustSpeed}` : ''}` : 'Unavailable'} />
        <SheetRow label="Runway wind" value={departure && windAvailable ? `${headwind >= 0 ? 'Head' : 'Tail'} ${Math.abs(headwind).toFixed(1)} kt / cross ${Math.abs(crosswind).toFixed(1)} kt` : 'Unavailable'} />
        <SheetRow label="V1 / VR / V2" value={fixtureMatches ? `${card.vSpeeds.v1Kt} / ${card.vSpeeds.vrKt} / ${card.vSpeeds.v2Kt} kt` : 'No matching gameplay fixture'} />
      </dl>
      <div aria-label="Preflight checks" style={{ color: 'var(--rfs-color-warn)', marginTop: 8 }}>
        {checks.map((check) => <div key={check}>{check}</div>)}
        {!fixtureMatches && <div>References unavailable for current runway, loading, weather or configuration.</div>}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary>Data quality</summary>
        <div>Runway: {departure?.sourceNote ?? 'RFS simulator catalog geometry; not dispatch data.'}</div>
        <div>Weather: current simulator conditions; observation age is not tracked.</div>
        <div>References: {card?.ownership.sourceNote ?? 'No performance card for this scenario.'}</div>
        <div>Fuel required, landing performance and takeoff distance: unavailable.</div>
      </details>
    </section>
  );
}
