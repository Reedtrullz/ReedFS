import type { CSSProperties } from 'react';
import type { CesiumScenePolicy } from '../config/cesium';

interface SceneStatusProps {
  policy: CesiumScenePolicy;
}

export function SceneStatus({ policy }: SceneStatusProps) {
  if (policy.mode === 'ion') {
    return null;
  }

  return (
    <div role="status" aria-live="polite" style={statusStyle}>
      <span style={titleStyle}>SCENERY DEGRADED</span>
      <span style={reasonStyle}>{policy.reason ?? 'Cesium Ion scenery is unavailable.'}</span>
    </div>
  );
}

const statusStyle: CSSProperties = {
  position: 'fixed',
  top: 14,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 160,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  maxWidth: 'min(520px, calc(100vw - 32px))',
  padding: '8px 12px',
  border: '1px solid rgba(255, 183, 77, 0.8)',
  borderRadius: 6,
  background: 'rgba(35, 22, 0, 0.88)',
  boxShadow: '0 0 18px rgba(0, 0, 0, 0.45)',
  color: '#ffe0a3',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  pointerEvents: 'none',
  textAlign: 'center',
};

const titleStyle: CSSProperties = {
  color: '#ffb74d',
  fontWeight: 900,
  letterSpacing: 1.2,
};

const reasonStyle: CSSProperties = {
  color: '#ffe8bf',
  fontWeight: 700,
  lineHeight: 1.35,
};
