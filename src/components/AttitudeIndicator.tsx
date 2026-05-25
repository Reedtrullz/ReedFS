import { useSimStore } from '../store/simStore';
import { quatToEuler } from '../sim/physics/quaternion';

export function AttitudeIndicator() {
  const quaternion = useSimStore((s) => s.aircraft.quaternion);
  const { phi, theta } = quatToEuler(quaternion);

  const size = 140;
  const center = size / 2;
  const pitchDeg = (theta * 180) / Math.PI;
  const pitchOffset = -pitchDeg * 3; // 3px per degree, negative so nose-up = horizon lower
  const rollDeg = (-phi * 180) / Math.PI; // negative phi = right wing down → positive visual roll

  return (
    <div style={{
      position: 'fixed',
      top: 10,
      right: 10,
      zIndex: 100,
      pointerEvents: 'none',
    }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ background: '#0a0a0a', borderRadius: '50%', border: '2px solid #333' }}
      >
        <defs>
          <clipPath id="attClip">
            <circle cx={center} cy={center} r={center - 2} />
          </clipPath>
        </defs>
        <g clipPath="url(#attClip)" transform={`rotate(${rollDeg}, ${center}, ${center})`}>
          {/* Sky */}
          <rect x={0} y={0} width={size} height={center + pitchOffset} fill="#3388cc" />
          {/* Ground */}
          <rect x={0} y={center + pitchOffset} width={size} height={size} fill="#6b4423" />
          {/* Horizon line */}
          <line x1={10} y1={center + pitchOffset} x2={size - 10} y2={center + pitchOffset}
            stroke="#fff" strokeWidth={2} />
          {/* Pitch marks: every 10 degrees */}
          {[-20, -10, 10, 20].map((deg) => {
            const y = center + pitchOffset - deg * 3;
            const w = deg % 20 === 0 ? 30 : 15;
            return (
              <g key={deg}>
                <line x1={center - w} y1={y} x2={center + w} y2={y} stroke="#fff" strokeWidth={1} />
                <text x={center + w + 4} y={y + 3} fill="#fff" fontSize={8}>{deg > 0 ? '+' : ''}{deg}</text>
              </g>
            );
          })}
        </g>
        {/* Fixed aircraft symbol (outside clip so it stays put) */}
        <g>
          <line x1={center - 20} y1={center} x2={center - 8} y2={center}
            stroke="#ff0" strokeWidth={2.5} />
          <line x1={center + 8} y1={center} x2={center + 20} y2={center}
            stroke="#ff0" strokeWidth={2.5} />
          <line x1={center} y1={center - 12} x2={center} y2={center - 4}
            stroke="#ff0" strokeWidth={2.5} />
          {/* Center dot */}
          <circle cx={center} cy={center} r={3} fill="#ff0" />
        </g>
        {/* Roll scale (top arc) */}
        <g>
          {[-30, -20, -10, 0, 10, 20, 30].map((deg) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const r = center - 8;
            const x = center + r * Math.cos(rad);
            const y = center + r * Math.sin(rad);
            return (
              <g key={`roll-${deg}`}>
                {deg === 0 ? (
                  <polygon points={`${center},${center - r + 6} ${center - 4},${center - r + 12} ${center + 4},${center - r + 12}`}
                    fill="#fff" />
                ) : (
                  <line x1={x - 3} y1={y} x2={x + 3} y2={y} stroke="#fff" strokeWidth={1}
                    transform={`rotate(${deg}, ${center}, ${center})`} />
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
