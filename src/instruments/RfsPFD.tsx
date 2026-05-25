import { useSimStore } from '../store/simStore';
import { computeDerived } from '../sim/physics/derived';

export function RfsPFD() {
  const a = useSimStore((s) => s.aircraft);
  const d = computeDerived(a);
  const pitch = (a.attitude.theta * 180) / Math.PI;
  const roll = (a.attitude.phi * 180) / Math.PI;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 200,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: '#0a0a0a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: 12,
          width: 220,
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#0f0',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 6, opacity: 0.5 }}>PFD</div>
        <div>
          SPD:{' '}
          <span style={{ fontSize: 18, fontWeight: 'bold' }}>{d.ias.toFixed(0)}</span>{' '}
          kt
        </div>
        <div>
          ALT:{' '}
          <span style={{ fontSize: 18, fontWeight: 'bold' }}>{a.position.alt.toFixed(0)}</span>{' '}
          ft
        </div>
        <div>
          HDG:{' '}
          <span style={{ fontSize: 18, fontWeight: 'bold' }}>
            {((a.attitude.psi * 180) / Math.PI).toFixed(0)}°
          </span>
        </div>
        <div style={{ marginTop: 4, opacity: 0.5 }}>
          PITCH {pitch.toFixed(1)}° | ROLL {roll.toFixed(1)}° | VS {d.vs.toFixed(0)} fpm
        </div>
      </div>
    </div>
  );
}
