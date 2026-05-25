import { useSimStore } from '../store/simStore';
import { computeDerived } from '../sim/physics/derived';
import { quatToEuler } from '../sim/physics/quaternion';

export function RfsPFD() {
  const a = useSimStore((s) => s.aircraft);
  const d = computeDerived(a);
  const euler = quatToEuler(a.quaternion);
  const pitch = (euler.theta * 180) / Math.PI;
  const hdg = ((euler.psi * 180) / Math.PI + 360) % 360;

  const tapeH = 280;
  const tapeW = 56;
  const pxPerKt = 2.2;
  const pxPerFt = 0.018;

  const spdOffset = -d.ias * pxPerKt + tapeH / 2;
  const altOffset = -a.position.alt * pxPerFt + tapeH / 2;

  const round10 = (v: number) => Math.round(v / 10) * 10;
  const round100 = (v: number) => Math.round(v / 100) * 100;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 200,
        zIndex: 100,
        pointerEvents: 'none',
        display: 'flex',
        gap: 4,
      }}
    >
      {/* Speed tape */}
      <div
        style={{
          background: '#0a0a0a',
          border: '1px solid #333',
          borderRadius: 4,
          overflow: 'hidden',
          width: tapeW,
          height: tapeH,
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: spdOffset, left: 0, right: 0 }}>
          {Array.from({ length: 40 }, (_, i) => {
            const spd = round10(d.ias) - 100 + i * 10;
            if (spd < 0) return null;
            const isMajor = spd % 20 === 0;
            return (
              <div
                key={spd}
                style={{
                  height: pxPerKt * 10,
                  textAlign: 'right',
                  paddingRight: 6,
                  fontFamily: 'monospace',
                  fontSize: isMajor ? 11 : 9,
                  color: isMajor ? '#fff' : '#888',
                  lineHeight: `${pxPerKt * 10}px`,
                }}
              >
                {isMajor ? spd : '·'}
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 2,
            background: '#ff0',
            marginTop: -1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: 6,
            transform: 'translateY(-50%)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: 22,
            fontWeight: 'bold',
            background: 'rgba(0,0,0,0.8)',
            padding: '0 4px',
            borderRadius: 2,
          }}
        >
          {d.ias.toFixed(0)}
        </div>
      </div>

      {/* Center — heading + pitch */}
      <div
        style={{
          background: '#0a0a0a',
          border: '1px solid #333',
          borderRadius: 4,
          width: 70,
          height: tapeH,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <div style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold' }}>
          {hdg.toFixed(0)}°
        </div>
        <div style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 11 }}>HDG</div>
        <div style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 11 }}>
          P {pitch.toFixed(1)}°
        </div>
        <div style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 11 }}>
          VS {d.vs.toFixed(0)}
        </div>
      </div>

      {/* Altitude tape */}
      <div
        style={{
          background: '#0a0a0a',
          border: '1px solid #333',
          borderRadius: 4,
          overflow: 'hidden',
          width: tapeW,
          height: tapeH,
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: altOffset, left: 0, right: 0 }}>
          {Array.from({ length: 30 }, (_, i) => {
            const alt = round100(a.position.alt) - 1000 + i * 100;
            if (alt < 0) return null;
            const isMajor = alt % 200 === 0;
            return (
              <div
                key={alt}
                style={{
                  height: pxPerFt * 100,
                  textAlign: 'left',
                  paddingLeft: 6,
                  fontFamily: 'monospace',
                  fontSize: isMajor ? 11 : 9,
                  color: isMajor ? '#fff' : '#888',
                  lineHeight: `${pxPerFt * 100}px`,
                }}
              >
                {isMajor ? alt : '·'}
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 2,
            background: '#ff0',
            marginTop: -1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 6,
            transform: 'translateY(-50%)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: 22,
            fontWeight: 'bold',
            background: 'rgba(0,0,0,0.8)',
            padding: '0 4px',
            borderRadius: 2,
          }}
        >
          {a.position.alt.toFixed(0)}
        </div>
      </div>
    </div>
  );
}
