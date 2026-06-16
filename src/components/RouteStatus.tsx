import type { CSSProperties } from 'react';
import type { ApproachHandoff } from '../sim/systems/navigation';
import { useSimStore } from '../store/simStore';

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 14,
  right: 14,
  zIndex: 110,
  width: 260,
  background: 'rgba(2, 8, 12, 0.82)',
  border: '1px solid rgba(157,220,255,0.35)',
  borderRadius: 8,
  color: '#e8f8ff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  padding: 12,
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
  pointerEvents: 'none',
};

const labelStyle: CSSProperties = {
  color: '#9ddcff',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
};

const routeNameStyle: CSSProperties = {
  color: '#ffffff',
  fontSize: 17,
  fontWeight: 900,
  marginTop: 5,
};

const routeSourceStyle: CSSProperties = {
  border: '1px solid rgba(255,216,74,0.45)',
  borderRadius: 4,
  color: '#ffd84a',
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1.25,
  marginTop: 6,
  padding: '4px 6px',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
  marginTop: 5,
};

const valueStyle: CSSProperties = {
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 800,
};

function formatDistanceNm(distanceNm: number | null): string | null {
  return typeof distanceNm === 'number' && Number.isFinite(distanceNm)
    ? `${distanceNm.toFixed(1)} NM`
    : null;
}

function formatTrackDeg(degreesTrue: number | null): string | null {
  if (typeof degreesTrue !== 'number' || !Number.isFinite(degreesTrue)) return null;
  const normalized = ((Math.round(degreesTrue) % 360) + 360) % 360;
  return `${String(normalized).padStart(3, '0')}°T`;
}

function formatEtaMinutes(minutes: number | null): string | null {
  return typeof minutes === 'number' && Number.isFinite(minutes)
    ? `${minutes.toFixed(1)} MIN`
    : null;
}

function approachHandoffText(routeStatus: { approachHandoff: ApproachHandoff; nextWaypointIdent: string | null }): string | null {
  switch (routeStatus.approachHandoff) {
    case 'final':
      return `Final ${routeStatus.nextWaypointIdent ?? 'approach fix'}`;
    case 'threshold':
      return `Threshold ${routeStatus.nextWaypointIdent ?? 'runway'}`;
    default:
      return null;
  }
}

function isLoadedRoute(routeStatus: { routeName: string; routeValid: boolean }): boolean {
  return routeStatus.routeValid && routeStatus.routeName !== 'NO ROUTE';
}

function RouteSourceReadback({ routeName }: { routeName: string }) {
  const syntheticApproach = routeName === 'KSEA→KPDX';
  return (
    <div style={routeSourceStyle}>
      <div>CANNED TRAINING ROUTE</div>
      <div style={{ color: '#ffefb8', fontWeight: 700 }}>Route editing unavailable</div>
      <div style={{ color: '#ffefb8', fontWeight: 700, marginTop: 2 }}>
        RFMS adapter seam only — no CDU/EXEC route edit UI
      </div>
      {syntheticApproach && (
        <div style={{ color: '#ffefb8', fontWeight: 700, marginTop: 2 }}>
          Synthetic training approach — not official procedure data
        </div>
      )}
    </div>
  );
}

function ApproachHandoffReadback({ text }: { text: string }) {
  return (
    <div style={{ color: '#7dffb2', fontSize: 12, lineHeight: 1.45, marginTop: 10 }}>
      <div style={labelStyle}>Approach handoff</div>
      <div style={{ color: '#e8f8ff', fontSize: 14, fontWeight: 900, marginTop: 4 }}>{text}</div>
    </div>
  );
}

export function RouteStatus() {
  const routeStatus = useSimStore((s) => s.routeStatus);
  const distanceText = formatDistanceNm(routeStatus.distanceToNextNm);
  const trackText = formatTrackDeg(routeStatus.desiredTrackDegTrue);
  const etaText = formatEtaMinutes(routeStatus.etaMinutes);
  const displayLegIndex = routeStatus.activeLegIndex !== null ? routeStatus.activeLegIndex + 1 : null;
  const displayLegCount = displayLegIndex !== null ? Math.max(routeStatus.activeLegCount, displayLegIndex) : 0;
  const legText = displayLegIndex !== null ? `LEG ${displayLegIndex}/${displayLegCount}` : null;
  const activeLegText = routeStatus.fromIdent && routeStatus.nextWaypointIdent
    ? `${routeStatus.fromIdent} → ${routeStatus.nextWaypointIdent}`
    : routeStatus.nextWaypointIdent;
  const unavailableReason = routeStatus.lnavUnavailableReason ?? 'unknown route status';
  const handoffText = approachHandoffText(routeStatus);

  return (
    <section aria-label="Route status" aria-live="polite" style={panelStyle}>
      <div style={labelStyle}>Route status</div>
      <div style={routeNameStyle}>{routeStatus.routeName}</div>
      {isLoadedRoute(routeStatus) && <RouteSourceReadback routeName={routeStatus.routeName} />}

      {routeStatus.routeComplete && handoffText ? (
        <ApproachHandoffReadback text={handoffText} />
      ) : routeStatus.routeComplete ? (
        <div style={{ color: '#7dffb2', fontSize: 12, lineHeight: 1.45, marginTop: 10 }}>
          Arrived — route complete
        </div>
      ) : routeStatus.lnavAvailable ? (
        <>
          <div style={{ ...rowStyle, marginTop: 10 }}>
            <span style={labelStyle}>Active</span>
            {legText && <span style={valueStyle}>{legText}</span>}
          </div>
          {activeLegText && (
            <div style={{ color: '#cfe5ef', fontSize: 14, fontWeight: 800, marginTop: 4 }}>
              {activeLegText}
            </div>
          )}
          {handoffText && <ApproachHandoffReadback text={handoffText} />}
          {distanceText && (
            <div style={rowStyle}>
              <span style={labelStyle}>DTG</span>
              <span style={valueStyle}>{distanceText}</span>
            </div>
          )}
          {trackText && (
            <div style={rowStyle}>
              <span style={labelStyle}>TRK</span>
              <span style={valueStyle}>{trackText}</span>
            </div>
          )}
          {etaText && (
            <div style={rowStyle}>
              <span style={labelStyle}>ETA</span>
              <span style={valueStyle}>{etaText}</span>
            </div>
          )}
        </>
      ) : (
        <div style={{ color: '#ffd84a', fontSize: 12, lineHeight: 1.45, marginTop: 10 }}>
          LNAV unavailable: {unavailableReason}
        </div>
      )}
    </section>
  );
}
