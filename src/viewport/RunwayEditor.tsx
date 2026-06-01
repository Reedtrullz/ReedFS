import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENVA_RUNWAY_09, SUPPORTED_RUNWAYS, type RunwayReference } from './runwayData';
import type { RunwayLayerProps } from './RunwayLayer';

const NUDGE_STEPS_M = [1, 5, 10, 50, 100];
const HEADING_STEPS_DEG = [0.1, 0.5, 1, 5];

/** metres per degree at ~63°N (ENVA) */
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

interface Props {
  /** Called when runway overrides change — pass this to RunwayLayer */
  onOverridesChange: (overrides: RunwayLayerProps['runwayOverrides']) => void;
}

interface EditableRunway {
  lat: number;
  lon: number;
  altFt: number;
  headingDeg: number;
  elevationFt: number;
}

function toEditable(rw: RunwayReference): EditableRunway {
  return {
    lat: rw.start.lat,
    lon: rw.start.lon,
    altFt: rw.start.altFt,
    headingDeg: rw.headingDeg,
    elevationFt: rw.elevationFt,
  };
}

function toOverrideKey(rw: RunwayReference): string {
  return `${rw.airport}-${rw.id}`;
}

function toOverrides(rw: RunwayReference, ed: EditableRunway): RunwayLayerProps['runwayOverrides'] {
  return {
    [toOverrideKey(rw)]: {
      start: { lat: ed.lat, lon: ed.lon, altFt: ed.altFt },
      headingDeg: ed.headingDeg,
      elevationFt: ed.elevationFt,
    },
  };
}

export function RunwayEditor({ onOverridesChange }: Props) {
  const [selectedRunway, setSelectedRunway] = useState<RunwayReference>(ENVA_RUNWAY_09);
  const [editable, setEditable] = useState<EditableRunway>(() => toEditable(ENVA_RUNWAY_09));
  const [nudgeStepM, setNudgeStepM] = useState(5);
  const [headingStepDeg, setHeadingStepDeg] = useState(0.5);
  const [copied, setCopied] = useState(false);

  const metersPerDegLon = useMemo(() => M_PER_DEG_LON(editable.lat), [editable.lat]);

  // Notify parent when editable changes
  useEffect(() => {
    onOverridesChange(toOverrides(selectedRunway, editable));
  }, [editable, selectedRunway, onOverridesChange]);

  const handleSelectRunway = useCallback(
    (airportRunwayId: string) => {
      const rw = SUPPORTED_RUNWAYS.find((r) => `${r.airport}-${r.id}` === airportRunwayId);
      if (!rw) return;
      setSelectedRunway(rw);
      setEditable(toEditable(rw));
    },
    [],
  );

  const nudgeLat = useCallback((deltaM: number) => {
    setEditable((prev) => ({ ...prev, lat: prev.lat + deltaM / M_PER_DEG_LAT }));
  }, []);

  const nudgeLon = useCallback((deltaM: number) => {
    setEditable((prev) => ({ ...prev, lon: prev.lon + deltaM / metersPerDegLon }));
  }, [metersPerDegLon]);

  const nudgeHeading = useCallback((deltaDeg: number) => {
    setEditable((prev) => ({ ...prev, headingDeg: prev.headingDeg + deltaDeg }));
  }, []);

  const handleCopy = useCallback(() => {
    const lines = [
      `  start: { lat: ${editable.lat.toFixed(5)}, lon: ${editable.lon.toFixed(5)}, altFt: ${editable.altFt} },`,
      `  headingDeg: ${Math.round(editable.headingDeg)},`,
      `  elevationFt: ${editable.elevationFt},`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editable]);

  const staticRw = SUPPORTED_RUNWAYS.find((r) => `${r.airport}-${r.id}` === `${selectedRunway.airport}-${selectedRunway.id}`);
  const hasChanges =
    staticRw &&
    (editable.lat !== staticRw.start.lat ||
      editable.lon !== staticRw.start.lon ||
      editable.headingDeg !== staticRw.headingDeg);

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>RUNWAY EDITOR</div>

      {/* Runway selector */}
      <select
        value={`${selectedRunway.airport}-${selectedRunway.id}`}
        onChange={(e) => handleSelectRunway(e.target.value)}
        style={selectStyle}
      >
        {SUPPORTED_RUNWAYS.map((rw) => (
          <option key={`${rw.airport}-${rw.id}`} value={`${rw.airport}-${rw.id}`}>
            {rw.airport} {rw.id} ({rw.label})
          </option>
        ))}
      </select>

      {/* Coordinates */}
      <div style={coordStyle}>
        <div style={coordRow}>
          <span style={labelStyle}>Lat</span>
          <span style={valueStyle}>{editable.lat.toFixed(6)}</span>
          <button style={nudgeBtn} onClick={() => nudgeLat(-nudgeStepM)}>▼</button>
          <button style={nudgeBtn} onClick={() => nudgeLat(nudgeStepM)}>▲</button>
        </div>
        <div style={coordRow}>
          <span style={labelStyle}>Lon</span>
          <span style={valueStyle}>{editable.lon.toFixed(6)}</span>
          <button style={nudgeBtn} onClick={() => nudgeLon(-nudgeStepM)}>◀</button>
          <button style={nudgeBtn} onClick={() => nudgeLon(nudgeStepM)}>▶</button>
        </div>
        <div style={coordRow}>
          <span style={labelStyle}>HDG</span>
          <span style={valueStyle}>{editable.headingDeg.toFixed(2)}°</span>
          <button style={nudgeBtn} onClick={() => nudgeHeading(-headingStepDeg)}>↺</button>
          <button style={nudgeBtn} onClick={() => nudgeHeading(headingStepDeg)}>↻</button>
        </div>
      </div>

      {/* Step sizes */}
      <div style={stepRow}>
        <span style={labelStyle}>Step (m)</span>
        {NUDGE_STEPS_M.map((step) => (
          <button
            key={step}
            style={{ ...stepBtn, ...(step === nudgeStepM ? activeStepBtn : {}) }}
            onClick={() => setNudgeStepM(step)}
          >
            {step}
          </button>
        ))}
      </div>
      <div style={stepRow}>
        <span style={labelStyle}>HDG (°)</span>
        {HEADING_STEPS_DEG.map((step) => (
          <button
            key={step}
            style={{ ...stepBtn, ...(step === headingStepDeg ? activeStepBtn : {}) }}
            onClick={() => setHeadingStepDeg(step)}
          >
            {step}
          </button>
        ))}
      </div>

      {/* Copy */}
      {hasChanges && (
        <button style={copyBtn} onClick={handleCopy}>
          {copied ? '✓ COPIED' : '📋 COPY CODE'}
        </button>
      )}

      <div style={hintStyle}>
        {hasChanges
          ? 'Copy the code above and paste into runwayData.ts'
          : 'Nudge to adjust. Copy-ready code appears here.'}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 14,
  right: 14,
  zIndex: 200,
  width: 300,
  background: 'rgba(2, 8, 12, 0.88)',
  border: '1px solid rgba(157, 220, 255, 0.35)',
  borderRadius: 8,
  color: '#e8f8ff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  padding: 12,
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
  fontSize: 11,
};

const titleStyle: React.CSSProperties = {
  color: '#9ddcff',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.2,
  marginBottom: 8,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  marginBottom: 8,
  background: 'rgba(0,0,0,0.72)',
  color: '#fff',
  border: '1px solid rgba(157,220,255,0.45)',
  borderRadius: 4,
  padding: '6px 8px',
  fontFamily: 'inherit',
  fontSize: 11,
};

const coordStyle: React.CSSProperties = { display: 'grid', gap: 4, marginBottom: 8 };

const coordRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const labelStyle: React.CSSProperties = {
  color: '#9ddcff',
  fontWeight: 700,
  minWidth: 28,
  fontSize: 10,
};

const valueStyle: React.CSSProperties = {
  flex: 1,
  color: '#fff',
  fontVariantNumeric: 'tabular-nums',
};

const nudgeBtn: React.CSSProperties = {
  background: 'rgba(157,220,255,0.12)',
  border: '1px solid rgba(157,220,255,0.25)',
  color: '#e8f8ff',
  borderRadius: 3,
  padding: '1px 6px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 10,
};

const stepRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginBottom: 5,
};

const stepBtn: React.CSSProperties = {
  background: 'rgba(157,220,255,0.08)',
  border: '1px solid rgba(157,220,255,0.2)',
  color: '#9ddcff',
  borderRadius: 3,
  padding: '1px 6px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 9,
};

const activeStepBtn: React.CSSProperties = {
  background: 'rgba(0,255,0,0.2)',
  border: '1px solid #0f0',
  color: '#0f0',
};

const copyBtn: React.CSSProperties = {
  width: '100%',
  marginTop: 6,
  background: 'rgba(0,255,0,0.15)',
  border: '1px solid rgba(0,255,0,0.4)',
  color: '#0f0',
  borderRadius: 4,
  padding: '6px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  fontWeight: 700,
};

const hintStyle: React.CSSProperties = {
  color: '#9db2bc',
  fontSize: 9,
  marginTop: 5,
  lineHeight: 1.3,
};
