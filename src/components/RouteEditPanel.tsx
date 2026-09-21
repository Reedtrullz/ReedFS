import type { CSSProperties } from 'react';
import { useSimStore } from '../store/simStore';

const panelStyle: CSSProperties = {
  background: 'rgba(2, 8, 12, 0.82)',
  border: '1px solid rgba(157,220,255,0.45)',
  borderRadius: 8,
  color: '#e8f8ff',
  display: 'grid',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  gap: 8,
  padding: 10,
  pointerEvents: 'auto',
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
};

const titleStyle: CSSProperties = {
  color: '#9ddcff',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1,
  textTransform: 'uppercase',
};

const waypointRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 6,
};

const identStyle: CSSProperties = {
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 800,
  minWidth: 92,
};

const buttonStyle: CSSProperties = {
  background: 'rgba(157,220,255,0.14)',
  border: '1px solid rgba(157,220,255,0.55)',
  borderRadius: 4,
  color: '#e8f8ff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 10,
  fontWeight: 900,
  padding: '4px 6px',
  textTransform: 'uppercase',
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'rgba(125,255,178,0.16)',
  borderColor: 'rgba(125,255,178,0.62)',
  color: '#d8ffe5',
};

const messageStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
};

export function RouteEditPanel() {
  const session = useSimStore((s) => s.routeEditSession);
  const message = useSimStore((s) => s.routeEditMessage);
  const stageDirectTo = useSimStore((s) => s.stageDirectTo);
  const stageInsertDiscontinuity = useSimStore((s) => s.stageInsertDiscontinuity);
  const undoRouteEditOperation = useSimStore((s) => s.undoRouteEditOperation);
  const executeRouteEdit = useSimStore((s) => s.executeRouteEdit);

  if (!session) {
    return (
      <section aria-label="Route edit" style={panelStyle}>
        <div style={titleStyle}>FMS route edit</div>
        <div style={{ ...messageStyle, color: '#ffd84a' }}>No route loaded</div>
      </section>
    );
  }

  const activeWaypoints = session.active.waypoints;
  const draftWaypoints = session.draft?.waypoints ?? null;
  const displayWaypoints = draftWaypoints ?? activeWaypoints;
  const rows = displayWaypoints.map((waypoint, index) => ({
    ident: waypoint.ident,
    index,
    draft: draftWaypoints !== null,
    discontinuity: Boolean(waypoint.discontinuity),
  }));
  const pendingCount = session.pendingOperations.length;

  return (
    <section aria-label="Route edit" style={panelStyle}>
      <div style={titleStyle}>FMS route edit</div>
      <div>
        {rows.map(({ ident, index, draft, discontinuity }) => (
          <div key={`${ident}-${index}-${draft ? 'd' : 'a'}`} style={waypointRowStyle}>
            <span style={{ ...identStyle, color: draft ? '#ffd84a' : '#ffffff' }}>
              {index + 1} {ident}
            </span>
            {!discontinuity && (
              <button
                type="button"
                style={buttonStyle}
                aria-label={`Direct to ${ident}`}
                onClick={() => stageDirectTo(ident)}
              >
                DIR TO
              </button>
            )}
            <button
              type="button"
              style={buttonStyle}
              aria-label={`Insert discontinuity after ${ident}`}
              onClick={() => stageInsertDiscontinuity(index)}
            >
              DISC
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          style={buttonStyle}
          disabled={pendingCount === 0}
          aria-label="Undo staged route edit"
          onClick={undoRouteEditOperation}
        >
          Undo
        </button>
        <button
          type="button"
          style={primaryButtonStyle}
          disabled={pendingCount === 0}
          aria-label="Execute staged route edits"
          onClick={executeRouteEdit}
        >
          Exec{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
      </div>
      {draftWaypoints && (
        <div aria-label="Route draft status" role="status" style={{ ...messageStyle, color: '#ffd84a' }}>
          Draft modifications pending EXEC
        </div>
      )}
      {message && (
        <div aria-label="Route edit message" role="alert" style={{ ...messageStyle, color: '#ff9d9d' }}>
          {message}
        </div>
      )}
    </section>
  );
}
