import type { CSSProperties } from 'react';
import { useSimStore } from '../store/simStore';
import { computeDerived } from '../sim/physics/derived';
import { quatToEuler } from '../sim/physics/quaternion';
import { deriveDisplayFmaTruth } from '../sim/systems/fmaTruth';

const glass: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(9,14,18,0.95), rgba(2,5,7,0.92))',
  border: '1px solid rgba(120,180,210,0.45)',
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
  color: '#e8f8ff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

function modeText(value: string | undefined): string {
  return value && value.length > 0 ? value : 'OFF';
}

function tapeTicks(center: number, step: number, radius: number, min = 0): number[] {
  const base = Math.round(center / step) * step;
  const ticks: number[] = [];
  for (let i = -radius; i <= radius; i += 1) {
    const value = base + i * step;
    if (value >= min && !ticks.includes(value)) ticks.push(value);
  }
  return ticks;
}

function FmaCell({ label, value }: { label: string; value: string }) {
  const active = value !== 'OFF';
  return (
    <div
      style={{
        flex: 1,
        borderLeft: '1px solid rgba(120,180,210,0.25)',
        padding: '5px 8px',
        minWidth: 0,
      }}
    >
      <div style={{ color: '#7fa6b7', fontSize: 10, letterSpacing: 1.4 }}>{label}</div>
      <div style={{ color: active ? '#6dff8d' : '#95a6ad', fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
}

function Tape({
  label,
  value,
  unit,
  ticks,
  align,
}: {
  label: string;
  value: number;
  unit: string;
  ticks: number[];
  align: 'left' | 'right';
}) {
  return (
    <div
      aria-label={label === 'IAS' ? 'Airspeed tape' : 'Altitude tape'}
      style={{
        ...glass,
        width: 104,
        height: 292,
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '7px 8px 4px', color: '#9ddcff', fontSize: 13, fontWeight: 800, letterSpacing: 1.2 }}>
        {label}
      </div>
      <div
        style={{
          margin: '0 8px',
          padding: '3px 6px',
          border: '1px solid #ffd84a',
          borderRadius: 4,
          color: '#ffffff',
          background: 'rgba(0,0,0,0.76)',
          fontSize: 28,
          fontWeight: 900,
          textAlign: align,
          lineHeight: 1.1,
        }}
      >
        {Math.round(value)}
      </div>
      <div style={{ color: '#7fa6b7', fontSize: 10, textAlign: align, padding: '2px 10px 4px' }}>{unit}</div>
      <div style={{ position: 'relative', flex: 1, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 2,
            background: '#ffd84a',
            boxShadow: '0 0 8px rgba(255,216,74,0.9)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column-reverse', height: '100%', justifyContent: 'space-around' }}>
          {ticks.map((tick) => (
            <div
              key={tick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                gap: 6,
                padding: '0 8px',
                color: tick % (label === 'IAS' ? 20 : 1000) === 0 ? '#ffffff' : '#9db2bc',
                fontSize: tick % (label === 'IAS' ? 20 : 1000) === 0 ? 13 : 11,
                fontWeight: 700,
              }}
            >
              {align === 'left' && <span style={{ width: 15, height: 1, background: '#9db2bc' }} />}
              <span>{tick}</span>
              {align === 'right' && <span style={{ width: 15, height: 1, background: '#9db2bc' }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function useFmaText(kind: 'thrustActive' | 'lateralActive' | 'verticalActive' | 'autopilotStatus') {
  return useSimStore((s) => modeText(deriveDisplayFmaTruth(s.apState, {
    aircraft: s.aircraft,
    flightPlan: s.flightPlan,
    routeStatus: s.routeStatus,
  })[kind]));
}

export function RfsPFD() {
  const ias = useSimStore((s) => Math.max(0, computeDerived(s.aircraft, s.wind).ias));
  const altitude = useSimStore((s) => Math.max(0, s.aircraft.position.alt));
  const vs = useSimStore((s) => computeDerived(s.aircraft, s.wind).vs);
  const pitch = useSimStore((s) => {
    const euler = quatToEuler(s.aircraft.quaternion);
    return (euler.theta * 180) / Math.PI;
  });
  const roll = useSimStore((s) => {
    const euler = quatToEuler(s.aircraft.quaternion);
    return (euler.phi * 180) / Math.PI;
  });
  const hdg = useSimStore((s) => {
    const euler = quatToEuler(s.aircraft.quaternion);
    return ((euler.psi * 180) / Math.PI + 360) % 360;
  });
  const thrustMode = useFmaText('thrustActive');
  const lateralMode = useFmaText('lateralActive');
  const verticalMode = useFmaText('verticalActive');
  const autopilotMode = useFmaText('autopilotStatus');

  return (
    <div
      aria-label="Primary flight display"
      style={{
        ...glass,
        position: 'fixed',
        bottom: 24,
        right: 188,
        zIndex: 100,
        width: 492,
        borderRadius: 10,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: '1px solid rgba(120,180,210,0.35)',
          background: 'rgba(0,0,0,0.48)',
        }}
      >
        <div style={{ width: 48, padding: '5px 8px', color: '#9ddcff', fontSize: 12, fontWeight: 900, letterSpacing: 1.5 }}>
          FMA
        </div>
        <FmaCell label="THR" value={thrustMode} />
        <FmaCell label="ROLL" value={lateralMode} />
        <FmaCell label="PITCH" value={verticalMode} />
        <FmaCell label="AP" value={autopilotMode} />
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'stretch' }}>
        <Tape label="IAS" value={ias} unit="KT" ticks={tapeTicks(ias, 10, 7)} align="right" />

        <div
          aria-label="Attitude and heading display"
          style={{
            ...glass,
            flex: 1,
            minWidth: 0,
            borderRadius: 8,
            height: 292,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '7px 10px 4px', color: '#9ddcff', fontSize: 13, fontWeight: 800, letterSpacing: 1.2 }}>
            ATT
          </div>
          <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#112534' }}>
            <div
              style={{
                position: 'absolute',
                inset: -80,
                transform: `translateY(${pitch * 4}px) rotate(${-roll}deg)`,
                transformOrigin: 'center',
              }}
            >
              <div style={{ height: '50%', background: 'linear-gradient(#2176b8, #54a9db)' }} />
              <div style={{ height: '50%', background: 'linear-gradient(#6f4829, #9b6434)' }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#ffffff' }} />
              {[-20, -10, 10, 20].map((deg) => (
                <div
                  key={deg}
                  style={{
                    position: 'absolute',
                    top: `calc(50% - ${deg * 4}px)`,
                    left: '36%',
                    width: '28%',
                    height: 1,
                    background: '#ffffff',
                  }}
                />
              ))}
            </div>
            <div style={{ position: 'absolute', top: '50%', left: '18%', right: '18%', height: 3, background: '#ffd84a' }} />
            <div style={{ position: 'absolute', top: 'calc(50% - 10px)', left: '50%', width: 3, height: 20, background: '#ffd84a' }} />
            <div style={{ position: 'absolute', left: 12, bottom: 10, color: '#ffffff', fontSize: 13, fontWeight: 800 }}>
              P {pitch.toFixed(1)}°
            </div>
            <div style={{ position: 'absolute', right: 12, bottom: 10, color: '#ffffff', fontSize: 13, fontWeight: 800 }}>
              R {roll.toFixed(1)}°
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderTop: '1px solid rgba(120,180,210,0.25)',
              background: 'rgba(0,0,0,0.45)',
            }}
          >
            <span style={{ color: '#9ddcff', fontSize: 13, fontWeight: 800 }}>HDG</span>
            <span style={{ color: '#ffffff', fontSize: 26, fontWeight: 900 }}>{hdg.toFixed(0).padStart(3, '0')}°</span>
            <span style={{ color: '#9ddcff', fontSize: 13, fontWeight: 800 }}>VS {vs.toFixed(0)}</span>
          </div>
        </div>

        <Tape label="ALT" value={altitude} unit="FT" ticks={tapeTicks(altitude, 500, 5)} align="left" />
      </div>
    </div>
  );
}
