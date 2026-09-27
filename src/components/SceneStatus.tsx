import type { CSSProperties } from 'react';
import type { CesiumScenePolicy } from '../config/cesium';
import type { CesiumSceneFailure } from '../viewport/CesiumViewport';

interface SceneStatusProps {
  policy: CesiumScenePolicy;
  /** Latest Ion scene failure after mount; a non-null value overrides degraded-only display */
  failure?: CesiumSceneFailure | null;
  /** Bumped by the parent when it remounts scenery after a retry */
  retryKey?: number;
  /** Invoked when the user requests scenery recovery; omit to hide the retry control */
  onRetry?: () => void;
}

const FAILURE_LABELS: Record<CesiumSceneFailure['stage'], string> = {
  load: 'Cesium scene failed to initialize.',
  buildings: '3D buildings could not be loaded.',
  imagery: 'Globe imagery or terrain hit a render error.',
};

export function SceneStatusOverlay({ policy, failure, retryKey, onRetry }: SceneStatusProps) {
  const failureMessage = failure ? FAILURE_LABELS[failure.stage] : null;

  if (policy.mode === 'ion' && !failureMessage) {
    return null;
  }

  return (
    <div role="status" aria-live="polite" style={statusStyle}>
      <span style={titleStyle}>{failureMessage ? 'SCENERY ERROR' : 'SCENERY DEGRADED'}</span>
      <span style={reasonStyle}>
        {failureMessage ?? policy.reason ?? 'Cesium Ion scenery is unavailable.'}
      </span>
      {onRetry && failureMessage ? (
        <button
          type="button"
          onClick={() => onRetry()}
          data-rfs-retry-scenery={retryKey ?? 0}
          style={retryButtonStyle}
        >
          RETRY SCENERY
        </button>
      ) : null}
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

const retryButtonStyle: CSSProperties = {
  pointerEvents: 'auto',
  alignSelf: 'center',
  marginTop: 4,
  padding: '4px 10px',
  border: '1px solid rgba(255, 183, 77, 0.9)',
  borderRadius: 4,
  background: 'rgba(60, 38, 0, 0.9)',
  color: '#ffe0a3',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1.2,
  cursor: 'pointer',
};
