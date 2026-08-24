import { useState, type CSSProperties } from 'react';
import { createRunwayToRunwayFlightWithRunways } from '../sim/flightPlanLoader';
import { useSimStore } from '../store/simStore';
import { SUPPORTED_RUNWAYS } from '../viewport/runwayData';

interface RouteBuilderPanelProps {
  onRouteLoad?: (message: string) => void;
}

interface RunwayDirectionOption {
  key: string;
  label: string;
}

function runwayDirectionOptions(): RunwayDirectionOption[] {
  const seen = new Set<string>();
  return SUPPORTED_RUNWAYS.flatMap((runway) => [
    { airport: runway.airport, runwayId: runway.id },
    { airport: runway.airport, runwayId: runway.oppositeId },
  ])
    .filter(({ airport, runwayId }) => {
      const key = `${airport}:${runwayId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ airport, runwayId }) => ({ key: `${airport}:${runwayId}`, label: `${airport} ${runwayId}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const RUNWAY_DIRECTION_OPTIONS = runwayDirectionOptions();
const DEFAULT_ORIGIN_KEY = RUNWAY_DIRECTION_OPTIONS.find((option) => option.key === 'ENVA:09')?.key ?? RUNWAY_DIRECTION_OPTIONS[0]?.key ?? '';
const DEFAULT_DESTINATION_KEY = RUNWAY_DIRECTION_OPTIONS.find((option) => option.key === 'ENGM:19R')?.key
  ?? RUNWAY_DIRECTION_OPTIONS.find((option) => option.key !== DEFAULT_ORIGIN_KEY)?.key
  ?? DEFAULT_ORIGIN_KEY;

function routeLabel(originKey: string, destinationKey: string): string {
  return `${originKey.replace(':', ' ')} → ${destinationKey.replace(':', ' ')}`;
}

export function RouteBuilderPanel({ onRouteLoad }: RouteBuilderPanelProps) {
  const [originKey, setOriginKey] = useState(DEFAULT_ORIGIN_KEY);
  const [destinationKey, setDestinationKey] = useState(DEFAULT_DESTINATION_KEY);
  const [loadedRouteLabel, setLoadedRouteLabel] = useState<string | null>(null);

  const setOriginSelection = (key: string) => {
    setOriginKey(key);
    setLoadedRouteLabel(null);
  };

  const setDestinationSelection = (key: string) => {
    setDestinationKey(key);
    setLoadedRouteLabel(null);
  };

  const loadRoute = () => {
    const [originAirport, originRunway] = originKey.split(':');
    const [destinationAirport, destinationRunway] = destinationKey.split(':');
    const { flightPlan, runways } = createRunwayToRunwayFlightWithRunways({
      originAirport,
      originRunway,
      destinationAirport,
      destinationRunway,
    });

    useSimStore.getState().setFlightPlanAtRunway(flightPlan, runways.originRunway);
    const loadedLabel = routeLabel(originKey, destinationKey);
    const loadedMessage = `RUNWAY ROUTE ${loadedLabel} loaded. LNAV/VNAV/SPD use generated training constraints; APP/G/S autoland remains synthetic-route only.`;
    setLoadedRouteLabel(loadedLabel);
    onRouteLoad?.(loadedMessage);
  };

  return (
    <section aria-label="Runway route builder" style={panelStyle}>
      <div style={titleStyle}>Custom runway route</div>
      <label style={labelStyle}>
        Custom origin
        <select aria-label="Custom origin runway" value={originKey} onChange={(event) => setOriginSelection(event.target.value)} style={selectStyle}>
          {RUNWAY_DIRECTION_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Custom destination
        <select aria-label="Custom destination runway" value={destinationKey} onChange={(event) => setDestinationSelection(event.target.value)} style={selectStyle}>
          {RUNWAY_DIRECTION_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </label>
      <button type="button" style={buttonStyle} disabled={originKey === destinationKey} onClick={loadRoute}>
        Load Route
      </button>
      {loadedRouteLabel && <div aria-label="Generated route result" role="status" style={messageStyle}>{loadedRouteLabel}</div>}
    </section>
  );
}

const panelStyle: CSSProperties = {
  background: 'rgba(2, 8, 12, 0.82)',
  border: '1px solid rgba(125, 255, 178, 0.36)',
  borderRadius: 8,
  color: '#e8f8ff',
  display: 'grid',
  gap: 8,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  padding: 10,
  pointerEvents: 'auto',
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
};

const titleStyle: CSSProperties = {
  color: '#7dffb2',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1,
  textTransform: 'uppercase',
};

const labelStyle: CSSProperties = {
  color: '#b8ffcf',
  display: 'grid',
  fontSize: 11,
  fontWeight: 800,
  gap: 3,
  textTransform: 'uppercase',
};

const selectStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(125, 255, 178, 0.4)',
  borderRadius: 4,
  color: '#ffffff',
  fontFamily: 'inherit',
  fontSize: 12,
  minWidth: 0,
  padding: '6px 7px',
};

const buttonStyle: CSSProperties = {
  background: 'rgba(125, 255, 178, 0.16)',
  border: '1px solid rgba(125, 255, 178, 0.62)',
  borderRadius: 4,
  color: '#d8ffe5',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 900,
  padding: '7px 8px',
  textTransform: 'uppercase',
};

const messageStyle: CSSProperties = {
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 800,
};
